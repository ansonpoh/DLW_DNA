import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";

const DISPATCH_TABLE = "reports.report_dispatches";

function toLowerText(value) {
  return String(value || "").trim().toLowerCase();
}

export function routeAgencyForReport(report) {
  const text = `${toLowerText(report?.type)} ${toLowerText(report?.description)}`;

  if (text.includes("fire") || text.includes("smoke")) {
    return "SCDF";
  }
  if (
    text.includes("medical") ||
    text.includes("injury") ||
    text.includes("unconscious")
  ) {
    return "SCDF";
  }
  if (
    text.includes("violence") ||
    text.includes("fight") ||
    text.includes("weapon") ||
    text.includes("assault") ||
    text.includes("threat") ||
    text.includes("rape") ||
    text.includes("sexual assault") ||
    text.includes("molest") ||
    text.includes("harass") ||
    text.includes("stalk") ||
    text.includes("kidnap") ||
    text.includes("robbery")
  ) {
    return "SPF";
  }
  if (text.includes("accident") || text.includes("traffic") || text.includes("crash")) {
    return "LTA_SPF";
  }

  return "MUNICIPAL_RESPONSE";
}

export function buildAgencyDispatch(report, aiGuidance = {}) {
  const agency = routeAgencyForReport(report);
  const payload = {
    agency,
    routing_mode: env.AGENCY_ROUTING_MODE || "rule_based",
    report: {
      report_id: report?.report_id || null,
      type: report?.type || "",
      description: report?.description || "",
      happening_now: Boolean(report?.happening_now),
      safe_to_continue: Boolean(report?.safe_to_continue),
      location_label: report?.location_label || "",
      location_source: report?.location_source || "",
      latitude: report?.latitude ?? null,
      longitude: report?.longitude ?? null,
      priority: report?.priority || "Medium",
      status: report?.status || "submitted",
      created_at: report?.created_at || null,
    },
    ai_guidance: {
      summary: String(aiGuidance?.summary || "").trim(),
      reassurance_message: String(aiGuidance?.reassurance_message || "").trim(),
      next_steps: Array.isArray(aiGuidance?.next_steps) ? aiGuidance.next_steps : [],
      validation_notes: String(aiGuidance?.validation_notes || "").trim(),
    },
  };

  const lines = [
    `Agency: ${agency}`,
    `Report ID: ${payload.report.report_id || "pending"}`,
    `Type: ${payload.report.type || "General"}`,
    `Priority: ${payload.report.priority}`,
    `Status: ${payload.report.status}`,
    `Location: ${payload.report.location_label || "Not provided"}`,
    `Coordinates: ${payload.report.latitude ?? "n/a"}, ${payload.report.longitude ?? "n/a"}`,
    `Description: ${payload.report.description || "No description provided."}`,
  ];

  if (payload.ai_guidance.summary) {
    lines.push(`AI Summary: ${payload.ai_guidance.summary}`);
  }

  return {
    agency,
    channel: "telegram_webhook",
    payload_json: payload,
    readable_summary: lines.join("\n"),
  };
}

export async function createAgencyDispatchLog(report, aiGuidance = {}) {
  const dispatch = buildAgencyDispatch(report, aiGuidance);
  const sql = `
    insert into ${DISPATCH_TABLE} (
      report_id,
      agency,
      channel,
      payload_json,
      delivery_status,
      sent_at
    )
    values ($1::uuid, $2, $3, $4::jsonb, $5, now())
    returning dispatch_id, report_id, agency, channel, delivery_status, sent_at
  `;
  const rows = await prisma.$queryRawUnsafe(
    sql,
    dispatch.payload_json.report.report_id,
    dispatch.agency,
    dispatch.channel,
    JSON.stringify(dispatch.payload_json),
    "prepared",
  );

  return {
    ...dispatch,
    dispatch_log: rows?.[0] || null,
  };
}
