import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";
import { createReportForProfileUserId } from "./reportService.js";
import {
  downloadTelegramFile,
  getTelegramFilePath,
  sendTelegramMessage,
} from "./telegramApiService.js";
import { transcribeVoiceBuffer } from "./sttService.js";
import { createAgencyDispatchLog } from "./agencyRoutingService.js";
import { geocodeLocationQuery } from "./geocodingService.js";
import { analyzeMediaForIncident } from "./detectionMediaService.js";

const TELEGRAM_LINKS_TABLE = "users.telegram_user_links";
const USERS_TABLE = "users.users";
const TELEGRAM_MEDIA_TYPE_EXT = {
  photo: ".jpg",
  video: ".mp4",
};
const INCIDENT_TYPE_TO_REPORT = {
  traffic_accident: "Accident/Traffic",
  pedestrian_vehicle_conflict: "Accident/Traffic",
  crowd_disturbance: "Violence/Assault",
  vehicle_stoppage_or_breakdown: "Accident/Traffic",
  no_clear_incident: "General Safety",
};

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }
  return String(value || "").trim();
}

function validateWebhookSecret(headers) {
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    return;
  }
  const incomingSecret = normalizeHeaderValue(
    headers?.["x-telegram-bot-api-secret-token"],
  );
  if (incomingSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
    throw new HttpError(401, "Invalid Telegram webhook secret.");
  }
}

function extractTelegramMessage(update) {
  if (!update || typeof update !== "object") {
    return null;
  }
  return update.message || update.edited_message || null;
}

export function detectTelegramMessageType(message) {
  if (message?.location) {
    return "location";
  }
  if (Array.isArray(message?.photo) && message.photo.length > 0) {
    return "photo";
  }
  if (message?.video) {
    return "video";
  }
  if (message?.voice) {
    return "voice";
  }
  if (typeof message?.text === "string" && message.text.trim()) {
    return "text";
  }
  return "unsupported";
}

function inferReportType(text, messageType) {
  const normalizedText = String(text || "").trim().toLowerCase();

  if (messageType === "location" && !normalizedText) {
    return "Suspicious Activity";
  }
  if (normalizedText.includes("fire") || normalizedText.includes("smoke")) {
    return "Fire/Smoke";
  }
  if (normalizedText.includes("medical") || normalizedText.includes("ambulance")) {
    return "Medical";
  }
  if (
    normalizedText.includes("fight") ||
    normalizedText.includes("violence") ||
    normalizedText.includes("weapon") ||
    normalizedText.includes("assault") ||
    normalizedText.includes("rape") ||
    normalizedText.includes("sexual assault") ||
    normalizedText.includes("molest") ||
    normalizedText.includes("harass") ||
    normalizedText.includes("stalk") ||
    normalizedText.includes("kidnap") ||
    normalizedText.includes("robbery")
  ) {
    return "Violence/Assault";
  }
  if (
    normalizedText.includes("accident") ||
    normalizedText.includes("crash") ||
    normalizedText.includes("traffic")
  ) {
    return "Accident/Traffic";
  }

  return "General Safety";
}

function inferPriority(type, description) {
  const text = `${String(type || "").toLowerCase()} ${String(description || "").toLowerCase()}`;

  if (
    text.includes("explosion") ||
    text.includes("weapon") ||
    text.includes("major fire") ||
    text.includes("collapsed") ||
    text.includes("rape") ||
    text.includes("sexual assault") ||
    text.includes("kidnap")
  ) {
    return "Critical";
  }
  if (
    text.includes("fire") ||
    text.includes("violence") ||
    text.includes("fight") ||
    text.includes("medical") ||
    text.includes("accident")
  ) {
    return "High";
  }
  if (text.includes("suspicious") || text.includes("hazard")) {
    return "Medium";
  }
  return "Medium";
}

function formatDisplayName(from) {
  const firstName = String(from?.first_name || "").trim();
  const lastName = String(from?.last_name || "").trim();
  const username = String(from?.username || "").trim();
  const joined = `${firstName} ${lastName}`.trim();
  return joined || username || "Telegram User";
}

function getMediaMaxBytes() {
  const fallback = 20 * 1024 * 1024;
  return Number.isFinite(env.TELEGRAM_MEDIA_MAX_BYTES)
    ? Math.max(1_000_000, env.TELEGRAM_MEDIA_MAX_BYTES)
    : fallback;
}

function getMediaDetails(messageType, message) {
  if (messageType === "photo") {
    const variants = Array.isArray(message?.photo) ? message.photo : [];
    if (!variants.length) {
      throw new HttpError(400, "Photo payload did not contain file variants.");
    }
    let selected = variants[0];
    for (const candidate of variants) {
      const selectedScore = Number(selected?.file_size || 0);
      const candidateScore = Number(candidate?.file_size || 0);
      if (candidateScore > selectedScore) {
        selected = candidate;
      }
    }
    return {
      fileId: String(selected?.file_id || "").trim(),
      fileSize: Number(selected?.file_size || 0),
      filename: `telegram-photo-${selected?.file_unique_id || "upload"}${TELEGRAM_MEDIA_TYPE_EXT.photo}`,
    };
  }

  if (messageType === "video") {
    const video = message?.video || {};
    const fileName = String(video?.file_name || "").trim();
    return {
      fileId: String(video?.file_id || "").trim(),
      fileSize: Number(video?.file_size || 0),
      filename:
        fileName || `telegram-video-${video?.file_unique_id || "upload"}${TELEGRAM_MEDIA_TYPE_EXT.video}`,
    };
  }

  throw new HttpError(400, "Unsupported Telegram media type.");
}

function mapIncidentTypeToReportType(incidentType, fallbackText = "") {
  const normalized = String(incidentType || "").trim().toLowerCase();
  if (INCIDENT_TYPE_TO_REPORT[normalized]) {
    return INCIDENT_TYPE_TO_REPORT[normalized];
  }
  return inferReportType(fallbackText, "text");
}

function inferPriorityFromMedia(incidentType, confidence, description) {
  const type = String(incidentType || "").trim().toLowerCase();
  if (type === "traffic_accident" && confidence >= 0.7) {
    return "High";
  }
  if (type === "pedestrian_vehicle_conflict" || type === "crowd_disturbance") {
    return confidence >= 0.65 ? "High" : "Medium";
  }
  return inferPriority(mapIncidentTypeToReportType(type), description);
}

function extractLocationPhraseFromText(text) {
  const source = String(text || "").trim();
  if (!source) {
    return "";
  }

  const lower = source.toLowerCase();
  const markerMatches = [
    /\bat\s+([a-z0-9\s,'-]{3,120})/i,
    /\bnear\s+([a-z0-9\s,'-]{3,120})/i,
    /\bin\s+([a-z0-9\s,'-]{3,120})/i,
  ];

  for (const matcher of markerMatches) {
    const match = lower.match(matcher);
    if (!match?.[1]) {
      continue;
    }

    let candidate = String(match[1] || "").trim();
    candidate = candidate.replace(
      /\b(help|please|urgent|asap|now|immediately|quickly|call|send)\b.*$/i,
      "",
    );
    candidate = candidate.replace(/[.!?].*$/g, "");
    candidate = candidate.replace(/\s+/g, " ").trim();

    if (candidate.length >= 3) {
      return candidate;
    }
  }

  return "";
}

async function inferLocationFromNarrative(text, geocodeLocation) {
  const phrase = extractLocationPhraseFromText(text);
  if (!phrase) {
    return {
      locationLabel: "",
      latitude: null,
      longitude: null,
      inferenceMode: "",
    };
  }

  try {
    const resolved = await geocodeLocation({
      query: phrase,
    });
    return {
      locationLabel: String(resolved?.display_name || phrase).trim(),
      latitude: resolved?.lat ?? null,
      longitude: resolved?.lng ?? null,
      inferenceMode: "geocoded",
    };
  } catch {
    return {
      locationLabel: phrase,
      latitude: null,
      longitude: null,
      inferenceMode: "extracted",
    };
  }
}

export async function normalizeTelegramUpdate(
  update,
  dependencies = {},
) {
  const transcribeVoice = dependencies.transcribeVoice || transcribeVoiceBuffer;
  const getFilePath = dependencies.getFilePath || getTelegramFilePath;
  const downloadFile = dependencies.downloadFile || downloadTelegramFile;
  const geocodeLocation = dependencies.geocodeLocation || geocodeLocationQuery;
  const analyzeMedia = dependencies.analyzeMedia || analyzeMediaForIncident;

  const message = extractTelegramMessage(update);
  if (!message) {
    return {
      ignored: true,
      reason: "No message payload in update.",
    };
  }

  const messageType = detectTelegramMessageType(message);
  if (messageType === "unsupported") {
    return {
      ignored: true,
      reason: "Unsupported Telegram message type.",
      chatId: String(message?.chat?.id || ""),
    };
  }

  let description = "";
  let mediaAnalysis = null;
  if (messageType === "text") {
    description = String(message.text || "").trim();
  } else if (messageType === "photo" || messageType === "video") {
    const details = getMediaDetails(messageType, message);
    if (!details.fileId) {
      throw new HttpError(400, `${messageType} message did not include file_id.`);
    }

    const maxBytes = getMediaMaxBytes();
    if (details.fileSize > maxBytes) {
      throw new HttpError(
        413,
        `Telegram ${messageType} exceeds size limit (${details.fileSize} bytes > ${maxBytes} bytes).`,
      );
    }

    const filePath = await getFilePath(details.fileId);
    const mediaBuffer = await downloadFile(filePath);
    if (mediaBuffer.length > maxBytes) {
      throw new HttpError(
        413,
        `Telegram ${messageType} download exceeds size limit (${mediaBuffer.length} bytes > ${maxBytes} bytes).`,
      );
    }

    mediaAnalysis = await analyzeMedia(mediaBuffer, {
      filename: details.filename,
      sourceId: "telegram-bot",
    });
    const caption = String(message?.caption || message?.text || "").trim();
    const detectedType = String(mediaAnalysis?.incidentType || "no_clear_incident").trim();
    const confidence = Number(mediaAnalysis?.confidence || 0);
    const summary = `Media analysis result: ${detectedType.replaceAll("_", " ")} (${Math.round(confidence * 100)}% confidence).`;
    description = caption ? `${caption}\n\n${summary}` : summary;
  } else if (messageType === "voice") {
    const fileId = String(message?.voice?.file_id || "").trim();
    if (!fileId) {
      throw new HttpError(400, "Voice message did not include file_id.");
    }
    const filePath = await getFilePath(fileId);
    const voiceBuffer = await downloadFile(filePath);
    description = await transcribeVoice(voiceBuffer);
  } else {
    description =
      String(message?.caption || "").trim() ||
      String(message?.text || "").trim() ||
      "User shared incident location on Telegram.";
  }

  let latitude = message?.location?.latitude ?? null;
  let longitude = message?.location?.longitude ?? null;
  let locationLabel =
    messageType === "location"
      ? "Telegram shared location"
      : String(message?.venue?.title || "").trim();
  let locationSource = `telegram_${messageType}`;

  if (latitude === null && longitude === null) {
    const inferred = await inferLocationFromNarrative(description, geocodeLocation);
    if (inferred.locationLabel) {
      locationLabel = inferred.locationLabel;
    }
    if (inferred.latitude !== null && inferred.longitude !== null) {
      latitude = inferred.latitude;
      longitude = inferred.longitude;
    }
    if (inferred.inferenceMode) {
      locationSource = `telegram_${messageType}_${inferred.inferenceMode}`;
    }
  }

  const reportType =
    messageType === "photo" || messageType === "video"
      ? mapIncidentTypeToReportType(mediaAnalysis?.incidentType, description)
      : inferReportType(description, messageType);
  const priority =
    messageType === "photo" || messageType === "video"
      ? inferPriorityFromMedia(mediaAnalysis?.incidentType, mediaAnalysis?.confidence, description)
      : inferPriority(reportType, description);

  return {
    ignored: false,
    messageType,
    updateId: update?.update_id ?? null,
    chatId: String(message?.chat?.id || ""),
    telegramUserId: String(message?.from?.id || ""),
    telegramUsername: String(message?.from?.username || "").trim(),
    telegramDisplayName: formatDisplayName(message?.from || {}),
    reportDraft: {
      type: reportType,
      description,
      happening_now: true,
      safe_to_continue: true,
      location_label: locationLabel,
      location_source: locationSource,
      latitude,
      longitude,
      priority,
      status: "submitted",
    },
  };
}

async function resolveOrCreateUserIdFromTelegram(normalized) {
  if (!normalized.telegramUserId) {
    throw new HttpError(400, "Telegram user id is required.");
  }

  const selectSql = `
    select user_id
    from ${TELEGRAM_LINKS_TABLE}
    where telegram_user_id = $1
    limit 1
  `;
  const existing = await prisma.$queryRawUnsafe(selectSql, normalized.telegramUserId);
  const existingUserId = existing?.[0]?.user_id || null;
  if (existingUserId) {
    return existingUserId;
  }

  return prisma.$transaction(async (tx) => {
    const insertUserSql = `
      insert into ${USERS_TABLE} (display_name)
      values ($1)
      returning user_id
    `;
    const userRows = await tx.$queryRawUnsafe(
      insertUserSql,
      normalized.telegramDisplayName,
    );
    const userId = userRows?.[0]?.user_id;
    if (!userId) {
      throw new HttpError(500, "Unable to create user profile for Telegram user.");
    }

    const linkSql = `
      insert into ${TELEGRAM_LINKS_TABLE} (
        telegram_user_id,
        chat_id,
        telegram_username,
        display_name_snapshot,
        user_id
      )
      values ($1, $2, $3, $4, $5::uuid)
      on conflict (telegram_user_id)
      do update set
        chat_id = excluded.chat_id,
        telegram_username = excluded.telegram_username,
        display_name_snapshot = excluded.display_name_snapshot,
        updated_at = now()
      returning user_id
    `;
    const linkedRows = await tx.$queryRawUnsafe(
      linkSql,
      normalized.telegramUserId,
      normalized.chatId || null,
      normalized.telegramUsername || null,
      normalized.telegramDisplayName,
      userId,
    );

    return linkedRows?.[0]?.user_id || userId;
  });
}

function buildAcknowledgement(reportId, dispatch) {
  const agency = dispatch?.agency || "UNASSIGNED";
  const report = dispatch?.payload_json?.report || {};
  const emergencyLine = agency === "SCDF" ? "995" : "999";
  const description = String(report.description || "").trim();
  const trimmedDescription =
    description.length > 280 ? `${description.slice(0, 277)}...` : description;

  return [
    "Report received and processed.",
    `Report ID: ${reportId}`,
    `Routed Agency: ${agency}`,
    `Type: ${report.type || "General Safety"}`,
    `Priority: ${report.priority || "Medium"}`,
    `Status: ${report.status || "submitted"}`,
    `Location: ${report.location_label || "Not provided"}`,
    `Description: ${trimmedDescription || "Not provided"}`,
    `If anyone is in immediate danger, call ${emergencyLine} now.`,
  ].join("\n");
}

export async function handleTelegramWebhook(update, headers) {
  validateWebhookSecret(headers);
  const normalized = await normalizeTelegramUpdate(update);

  if (normalized.ignored) {
    if (normalized.chatId) {
      await sendTelegramMessage(
        normalized.chatId,
        "Message received, but this content type is not supported yet.",
      );
    }
    return {
      ok: true,
      ignored: true,
      reason: normalized.reason,
    };
  }

  const userId = await resolveOrCreateUserIdFromTelegram(normalized);
  const created = await createReportForProfileUserId(userId, normalized.reportDraft);
  const dispatch = await createAgencyDispatchLog(created.report, created.ai_guidance);

  try {
    await sendTelegramMessage(
      normalized.chatId,
      buildAcknowledgement(created.report.report_id, dispatch),
    );
  } catch (error) {
    console.error(
      "[telegram:webhook] failed to send acknowledgement:",
      error?.message || String(error),
    );
  }

  return {
    ok: true,
    report_id: created.report.report_id,
    message_type: normalized.messageType,
    agency_dispatch: {
      agency: dispatch.agency,
      readable_summary: dispatch.readable_summary,
      payload_json: dispatch.payload_json,
    },
  };
}
