import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { HttpError } from "../utils/httpError.js";

const PROFILE_TABLE = "users.users";
const REPORTS_TABLE_SCHEMA = "reports";
const REPORTS_TABLE_NAME = "reports";
const REPORTS_TABLE = `${REPORTS_TABLE_SCHEMA}.${REPORTS_TABLE_NAME}`;
const DEFAULT_STATUS = "submitted";
const DEFAULT_PRIORITY = "Medium";
const DEFAULT_DETECTION_PRIORITY = "High";
const DEFAULT_DETECTION_TYPE = "Accident";
const REPORT_COLUMN_CANDIDATES = {
  type: ["type"],
  description: ["description"],
  happening_now: ["happening_now", "happening_no"],
  safe_to_continue: ["safe_to_continue", "safe_to_conti"],
  location_label: ["location_label"],
  location_source: ["location_source", "location_sourc"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "lon"],
  status: ["status"],
  priority: ["priority"],
};

function normalizeCreateReportPayload(payload) {
  return {
    type: String(payload?.type || "").trim(),
    description: String(payload?.description || "").trim(),
    happening_now: Boolean(payload?.happening_now),
    safe_to_continue: Boolean(payload?.safe_to_continue),
    location_label: String(payload?.location_label || "").trim(),
    location_source: String(payload?.location_source || "").trim(),
    latitude: payload?.latitude ?? null,
    longitude: payload?.longitude ?? null,
    priority: String(payload?.priority || "").trim(),
    status: String(payload?.status || "").trim(),
  };
}

function normalizeCreateDetectionPayload(payload) {
  return {
    type: String(payload?.type || DEFAULT_DETECTION_TYPE).trim() || DEFAULT_DETECTION_TYPE,
    description: String(payload?.description || "").trim(),
    happening_now: payload?.happening_now ?? true,
    safe_to_continue: payload?.safe_to_continue ?? false,
    location_label: String(payload?.location_label || "").trim(),
    location_source: String(payload?.location_source || "camera").trim(),
    latitude: payload?.latitude ?? null,
    longitude: payload?.longitude ?? null,
    priority:
      String(payload?.priority || DEFAULT_DETECTION_PRIORITY).trim() ||
      DEFAULT_DETECTION_PRIORITY,
    status: String(payload?.status || DEFAULT_STATUS).trim() || DEFAULT_STATUS,
    camera_id: String(payload?.camera_id || "").trim(),
    confidence: payload?.confidence,
    detected_at: String(payload?.detected_at || "").trim(),
  };
}

function parseCoordinate(value, fieldName) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new HttpError(400, `${fieldName} must be a valid number.`);
  }

  return parsed;
}

function validateCoordinates(latitude, longitude) {
  if ((latitude === null) !== (longitude === null)) {
    throw new HttpError(
      400,
      "Latitude and longitude must be provided together when setting a map location.",
    );
  }

  if (latitude === null || longitude === null) {
    return;
  }

  if (latitude < -90 || latitude > 90) {
    throw new HttpError(400, "Latitude must be between -90 and 90.");
  }

  if (longitude < -180 || longitude > 180) {
    throw new HttpError(400, "Longitude must be between -180 and 180.");
  }
}

async function getReportColumnMapping() {
  const columnsSql = `
    select column_name
    from information_schema.columns
    where table_schema = $1
      and table_name = $2
  `;
  const columns = await prisma.$queryRawUnsafe(
    columnsSql,
    REPORTS_TABLE_SCHEMA,
    REPORTS_TABLE_NAME,
  );
  const availableColumns = new Set(columns.map((entry) => entry.column_name));
  const mapping = {};

  for (const [field, candidates] of Object.entries(REPORT_COLUMN_CANDIDATES)) {
    const matchedColumn = candidates.find((candidate) =>
      availableColumns.has(candidate),
    );
    if (matchedColumn) {
      mapping[field] = matchedColumn;
    }
  }

  return mapping;
}

async function getProfileUserId(supabaseUserId) {
  const sql = `
    select user_id
    from ${PROFILE_TABLE}
    where supabase_id = $1::uuid
    limit 1
  `;
  const rows = await prisma.$queryRawUnsafe(sql, supabaseUserId);
  const profileUserId = rows?.[0]?.user_id || null;

  if (!profileUserId) {
    throw new HttpError(
      400,
      "No linked profile row found for this account. Complete registration/profile setup first.",
    );
  }

  return profileUserId;
}

function buildDetectionDescription(reportInput) {
  const tags = [];
  if (reportInput.camera_id) {
    tags.push(`camera=${reportInput.camera_id}`);
  }
  if (reportInput.confidence !== null && reportInput.confidence !== undefined) {
    const parsed = Number(reportInput.confidence);
    if (!Number.isNaN(parsed)) {
      tags.push(`confidence=${parsed.toFixed(2)}`);
    }
  }
  if (reportInput.detected_at) {
    tags.push(`detected_at=${reportInput.detected_at}`);
  }

  const suffix = tags.length ? ` [${tags.join(", ")}]` : "";
  return (
    reportInput.description ||
    `Accident detected by automated camera analysis.${suffix}`
  );
}

function buildInsertParts(reportInput, mapping) {
  const insertColumns = ["user_id"];
  const placeholders = ["$1::uuid"];
  const values = [reportInput.user_id];
  let index = 2;

  const assignIfMapped = (field, value) => {
    const column = mapping[field];
    if (!column) {
      return;
    }

    insertColumns.push(column);
    placeholders.push(`$${index}`);
    values.push(value);
    index += 1;
  };

  assignIfMapped("type", reportInput.type);
  assignIfMapped("description", reportInput.description);
  assignIfMapped("happening_now", reportInput.happening_now);
  assignIfMapped("safe_to_continue", reportInput.safe_to_continue);
  assignIfMapped("location_label", reportInput.location_label);
  assignIfMapped("location_source", reportInput.location_source || "manual");
  assignIfMapped("latitude", reportInput.latitude);
  assignIfMapped("longitude", reportInput.longitude);
  assignIfMapped("priority", reportInput.priority || DEFAULT_PRIORITY);
  assignIfMapped("status", reportInput.status || DEFAULT_STATUS);

  return { insertColumns, placeholders, values };
}

function buildSelectColumns(mapping) {
  const baseColumns = ["report_id", "created_at"];
  const mappedColumns = new Set(Object.values(mapping));
  for (const column of mappedColumns) {
    baseColumns.push(column);
  }
  return baseColumns;
}

function toJsonSafeValue(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

function shapeReportResponse(row, mapping) {
  const reportId = toJsonSafeValue(row?.report_id ?? null);
  return {
    report_id: reportId,
    type: mapping.type ? row?.[mapping.type] ?? "" : "",
    description: mapping.description ? row?.[mapping.description] ?? "" : "",
    happening_now: mapping.happening_now ? Boolean(row?.[mapping.happening_now]) : false,
    safe_to_continue: mapping.safe_to_continue
      ? Boolean(row?.[mapping.safe_to_continue])
      : true,
    location_label: mapping.location_label ? row?.[mapping.location_label] ?? "" : "",
    location_source: mapping.location_source ? row?.[mapping.location_source] ?? "" : "",
    latitude: mapping.latitude ? row?.[mapping.latitude] ?? null : null,
    longitude: mapping.longitude ? row?.[mapping.longitude] ?? null : null,
    priority: mapping.priority ? row?.[mapping.priority] ?? DEFAULT_PRIORITY : DEFAULT_PRIORITY,
    status: mapping.status ? row?.[mapping.status] ?? DEFAULT_STATUS : DEFAULT_STATUS,
    created_at: toJsonSafeValue(row?.created_at ?? null),
  };
}

async function createReportForUserId(userId, payload) {
  payload.latitude = parseCoordinate(payload.latitude, "latitude");
  payload.longitude = parseCoordinate(payload.longitude, "longitude");
  validateCoordinates(payload.latitude, payload.longitude);

  payload.user_id = userId;

  const mapping = await getReportColumnMapping();
  const { insertColumns, placeholders, values } = buildInsertParts(payload, mapping);
  const selectColumns = buildSelectColumns(mapping);
  const insertSql = `
    insert into ${REPORTS_TABLE} (${insertColumns.join(", ")})
    values (${placeholders.join(", ")})
    returning ${selectColumns.join(", ")}
  `;
  const rows = await prisma.$queryRawUnsafe(insertSql, ...values);
  const created = rows?.[0];

  return {
    message: "Report submitted successfully.",
    report: shapeReportResponse(created, mapping),
  };
}

export async function createReport(authUser, payload) {
  const reportInput = normalizeCreateReportPayload(payload);

  if (!reportInput.type) {
    throw new HttpError(400, "Report type is required.");
  }

  if (!reportInput.description) {
    throw new HttpError(400, "Report description is required.");
  }

  const profileUserId = await getProfileUserId(authUser.id);
  return createReportForUserId(profileUserId, reportInput);
}

export async function createDetectionReport(payload) {
  if (!env.DETECTION_REPORT_USER_ID) {
    throw new HttpError(
      500,
      "DETECTION_REPORT_USER_ID is not configured on the backend server.",
    );
  }

  const reportInput = normalizeCreateDetectionPayload(payload);
  reportInput.description = buildDetectionDescription(reportInput);

  return createReportForUserId(env.DETECTION_REPORT_USER_ID, reportInput);
}

export async function listOwnReports(authUser) {
  const mapping = await getReportColumnMapping();
  const profileUserId = await getProfileUserId(authUser.id);
  const selectColumns = buildSelectColumns(mapping);
  const listSql = `
    select ${selectColumns.join(", ")}
    from ${REPORTS_TABLE}
    where user_id = $1::uuid
    order by created_at desc nulls last, report_id desc
    limit 50
  `;
  const rows = await prisma.$queryRawUnsafe(listSql, profileUserId);

  return {
    reports: rows.map((row) => shapeReportResponse(row, mapping)),
  };
}
