import { prisma } from "../config/prisma.js";
import { supabaseAdmin } from "../config/supabase.js";
import { HttpError } from "../utils/httpError.js";

const PROFILE_TABLE_SCHEMA = "users";
const PROFILE_TABLE_NAME = "users";
const PROFILE_TABLE = `${PROFILE_TABLE_SCHEMA}.${PROFILE_TABLE_NAME}`;
const PROFILE_FIELD_CANDIDATES = {
  display_name: ["display_name", "name"],
  email: ["email"],
  phone_number: ["phone_number", "phone", "mobile_number"],
  home_location: ["home_location", "home_address"],
  work_location: ["work_location", "work_address"],
};

async function getProfileColumnMapping() {
  const columnsSql = `
    select column_name
    from information_schema.columns
    where table_schema = $1
      and table_name = $2
  `;
  const columns = await prisma.$queryRawUnsafe(
    columnsSql,
    PROFILE_TABLE_SCHEMA,
    PROFILE_TABLE_NAME,
  );
  const availableColumns = new Set(columns.map((entry) => entry.column_name));
  const mapping = {};

  for (const [field, candidates] of Object.entries(PROFILE_FIELD_CANDIDATES)) {
    const matchedColumn = candidates.find((candidate) =>
      availableColumns.has(candidate),
    );

    if (matchedColumn) {
      mapping[field] = matchedColumn;
    }
  }

  return mapping;
}

function normalizeProfilePayload(payload) {
  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(payload, "display_name")) {
    normalized.display_name = String(payload.display_name || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(payload, "email")) {
    normalized.email = String(payload.email || "").trim().toLowerCase();
  }
  if (Object.prototype.hasOwnProperty.call(payload, "phone_number")) {
    normalized.phone_number = String(payload.phone_number || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(payload, "home_location")) {
    normalized.home_location = String(payload.home_location || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(payload, "work_location")) {
    normalized.work_location = String(payload.work_location || "").trim();
  }

  return normalized;
}

function shapeProfileResponse(row, mapping, authUser) {
  return {
    display_name:
      (mapping.display_name ? row?.[mapping.display_name] : null) ||
      authUser.user_metadata?.name ||
      "",
    email:
      (mapping.email ? row?.[mapping.email] : null) || authUser.email || "",
    phone_number: (mapping.phone_number ? row?.[mapping.phone_number] : null) || "",
    home_location: (mapping.home_location ? row?.[mapping.home_location] : null) || "",
    work_location: (mapping.work_location ? row?.[mapping.work_location] : null) || "",
  };
}

async function getProfileRowBySupabaseId(supabaseId, mapping) {
  const selectedColumns = ["supabase_id", ...new Set(Object.values(mapping))];
  const selectSql = `
    select ${selectedColumns.join(", ")}
    from ${PROFILE_TABLE}
    where supabase_id = $1::uuid
    limit 1
  `;
  const rows = await prisma.$queryRawUnsafe(selectSql, supabaseId);
  return rows[0] || null;
}

export async function fetchProfile(authUser) {
  const columnMapping = await getProfileColumnMapping();
  const row = await getProfileRowBySupabaseId(authUser.id, columnMapping);

  return {
    profile: shapeProfileResponse(row, columnMapping, authUser),
    supported_fields: {
      display_name: Boolean(columnMapping.display_name),
      email: Boolean(columnMapping.email),
      phone_number: Boolean(columnMapping.phone_number),
      home_location: Boolean(columnMapping.home_location),
      work_location: Boolean(columnMapping.work_location),
    },
  };
}

export async function updateProfile(authUser, payload) {
  const updates = normalizeProfilePayload(payload || {});
  const updateKeys = Object.keys(updates);

  if (!updateKeys.length) {
    throw new HttpError(400, "No profile fields were provided.");
  }

  if (
    Object.prototype.hasOwnProperty.call(updates, "display_name") &&
    !updates.display_name
  ) {
    throw new HttpError(400, "Display name cannot be empty.");
  }

  if (
    Object.prototype.hasOwnProperty.call(updates, "email") &&
    (!updates.email || !updates.email.includes("@"))
  ) {
    throw new HttpError(400, "Please provide a valid email.");
  }

  let authUserForResponse = authUser;

  if (
    Object.prototype.hasOwnProperty.call(updates, "email") &&
    updates.email !== authUser.email
  ) {
    const { error: authUpdateError } =
      await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
        email: updates.email,
      });

    if (authUpdateError) {
      throw new HttpError(400, `Unable to update auth email: ${authUpdateError.message}`);
    }

    authUserForResponse = { ...authUser, email: updates.email };
  }

  const columnMapping = await getProfileColumnMapping();
  const mappedAssignments = [];
  const mappedValues = [authUser.id];
  let parameterIndex = 2;

  for (const field of updateKeys) {
    const mappedColumn = columnMapping[field];
    if (!mappedColumn) {
      continue;
    }

    mappedAssignments.push(`${mappedColumn} = $${parameterIndex}`);
    mappedValues.push(updates[field]);
    parameterIndex += 1;
  }

  if (mappedAssignments.length) {
    const updateSql = `
      update ${PROFILE_TABLE}
      set ${mappedAssignments.join(", ")}
      where supabase_id = $1::uuid
    `;
    const affectedRows = await prisma.$executeRawUnsafe(updateSql, ...mappedValues);

    if (affectedRows === 0) {
      const insertColumns = ["supabase_id"];
      const insertPlaceholders = ["$1::uuid"];
      const insertValues = [authUser.id];
      let insertIndex = 2;

      for (const field of updateKeys) {
        const mappedColumn = columnMapping[field];
        if (!mappedColumn) {
          continue;
        }

        insertColumns.push(mappedColumn);
        insertPlaceholders.push(`$${insertIndex}`);
        insertValues.push(updates[field]);
        insertIndex += 1;
      }

      if (insertColumns.length > 1) {
        const insertSql = `
          insert into ${PROFILE_TABLE} (${insertColumns.join(", ")})
          values (${insertPlaceholders.join(", ")})
        `;
        await prisma.$executeRawUnsafe(insertSql, ...insertValues);
      }
    }
  }

  const refreshedRow = await getProfileRowBySupabaseId(authUser.id, columnMapping);

  return {
    message: "Profile updated successfully.",
    profile: shapeProfileResponse(refreshedRow, columnMapping, authUserForResponse),
    ignored_fields: updateKeys.filter((field) => !columnMapping[field]),
  };
}
