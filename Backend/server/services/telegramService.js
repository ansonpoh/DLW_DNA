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

const TELEGRAM_LINKS_TABLE = "users.telegram_user_links";
const USERS_TABLE = "users.users";

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
  if (messageType === "text") {
    description = String(message.text || "").trim();
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

  const reportType = inferReportType(description, messageType);

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
      priority: inferPriority(reportType, description),
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
