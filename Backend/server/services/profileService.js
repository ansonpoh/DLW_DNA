import { prisma } from "../config/prisma.js";
import { supabaseAdmin } from "../config/supabase.js";
import { HttpError } from "../utils/httpError.js";

const PROFILE_TABLE_SCHEMA = "users";
const PROFILE_TABLE_NAME = "users";
const PROFILE_TABLE = `${PROFILE_TABLE_SCHEMA}.${PROFILE_TABLE_NAME}`;
const USER_PLACES_TABLE_SCHEMA = "users";
const USER_PLACES_TABLE_NAME = "user_places";
const USER_PLACES_TABLE = `${USER_PLACES_TABLE_SCHEMA}.${USER_PLACES_TABLE_NAME}`;
const HOME_PLACE_LABEL = "home";
const WORK_PLACE_LABEL = "work";
const GEOHASH_PRECISION = 9;
const GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
const PROFILE_FIELD_CANDIDATES = {
  display_name: ["display_name", "name"],
  email: ["email"],
  phone_number: ["phone_number", "phone", "mobile_number"],
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
  if (Object.prototype.hasOwnProperty.call(payload, "home_lat")) {
    normalized.home_lat = payload.home_lat;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "home_lng")) {
    normalized.home_lng = payload.home_lng;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "work_lat")) {
    normalized.work_lat = payload.work_lat;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "work_lng")) {
    normalized.work_lng = payload.work_lng;
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
    home_location: "",
    home_lat: null,
    home_lng: null,
    home_geohash: "",
    work_location: "",
    work_lat: null,
    work_lng: null,
    work_geohash: "",
  };
}

async function getProfileRowByUserAuthId(userAuthId, mapping) {
  const selectedColumns = ["supabase_id", "user_id", ...new Set(Object.values(mapping))];
  const selectSql = `
    select ${selectedColumns.join(", ")}
    from ${PROFILE_TABLE}
    where supabase_id = $1::uuid
    limit 1
  `;
  const rows = await prisma.$queryRawUnsafe(selectSql, userAuthId);
  return rows[0] || null;
}

async function getUserPlacesCapabilities() {
  const columnsSql = `
    select column_name
    from information_schema.columns
    where table_schema = $1
      and table_name = $2
  `;
  const columns = await prisma.$queryRawUnsafe(
    columnsSql,
    USER_PLACES_TABLE_SCHEMA,
    USER_PLACES_TABLE_NAME,
  );
  const availableColumns = new Set(columns.map((entry) => entry.column_name));

  return {
    hasTable: columns.length > 0,
    hasUserId: availableColumns.has("user_id"),
    hasLabel: availableColumns.has("label"),
    hasName: availableColumns.has("name"),
    hasLat: availableColumns.has("lat"),
    hasLng: availableColumns.has("lng"),
    hasGeohash: availableColumns.has("geohash"),
  };
}

async function getUserPlacesByLabel(userId) {
  const sql = `
    select label, name, lat, lng, geohash
    from ${USER_PLACES_TABLE}
    where user_id = $1::uuid
      and lower(label) in ($2, $3)
  `;
  const rows = await prisma.$queryRawUnsafe(
    sql,
    userId,
    HOME_PLACE_LABEL,
    WORK_PLACE_LABEL,
  );
  const result = {
    home_location: "",
    home_lat: null,
    home_lng: null,
    home_geohash: "",
    work_location: "",
    work_lat: null,
    work_lng: null,
    work_geohash: "",
  };

  for (const row of rows) {
    const normalizedLabel = String(row.label || "").toLowerCase();
    if (normalizedLabel === HOME_PLACE_LABEL) {
      result.home_location = String(row.name || "");
      result.home_lat = row.lat ?? null;
      result.home_lng = row.lng ?? null;
      result.home_geohash = String(row.geohash || "");
    }
    if (normalizedLabel === WORK_PLACE_LABEL) {
      result.work_location = String(row.name || "");
      result.work_lat = row.lat ?? null;
      result.work_lng = row.lng ?? null;
      result.work_geohash = String(row.geohash || "");
    }
  }

  return result;
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

function validateLatLng(lat, lng, label) {
  const labelText = label === HOME_PLACE_LABEL ? "Home" : "Work";

  if ((lat === null) !== (lng === null)) {
    throw new HttpError(
      400,
      `${labelText} latitude and longitude must be provided together.`,
    );
  }

  if (lat === null || lng === null) {
    return;
  }

  if (lat < -90 || lat > 90) {
    throw new HttpError(400, `${labelText} latitude must be between -90 and 90.`);
  }

  if (lng < -180 || lng > 180) {
    throw new HttpError(400, `${labelText} longitude must be between -180 and 180.`);
  }
}

function encodeGeohash(lat, lng, precision = GEOHASH_PRECISION) {
  let latitudeRange = [-90, 90];
  let longitudeRange = [-180, 180];
  let hash = "";
  let bit = 0;
  let charIndex = 0;
  let isEvenBit = true;

  while (hash.length < precision) {
    if (isEvenBit) {
      const mid = (longitudeRange[0] + longitudeRange[1]) / 2;
      if (lng >= mid) {
        charIndex = (charIndex << 1) + 1;
        longitudeRange[0] = mid;
      } else {
        charIndex = (charIndex << 1) + 0;
        longitudeRange[1] = mid;
      }
    } else {
      const mid = (latitudeRange[0] + latitudeRange[1]) / 2;
      if (lat >= mid) {
        charIndex = (charIndex << 1) + 1;
        latitudeRange[0] = mid;
      } else {
        charIndex = (charIndex << 1) + 0;
        latitudeRange[1] = mid;
      }
    }

    isEvenBit = !isEvenBit;
    bit += 1;

    if (bit === 5) {
      hash += GEOHASH_BASE32[charIndex];
      bit = 0;
      charIndex = 0;
    }
  }

  return hash;
}

function normalizeLocationInput(updates, label) {
  const isHome = label === HOME_PLACE_LABEL;
  const nameField = isHome ? "home_location" : "work_location";
  const latField = isHome ? "home_lat" : "work_lat";
  const lngField = isHome ? "home_lng" : "work_lng";

  const hasNameField = Object.prototype.hasOwnProperty.call(updates, nameField);
  const hasLatField = Object.prototype.hasOwnProperty.call(updates, latField);
  const hasLngField = Object.prototype.hasOwnProperty.call(updates, lngField);

  if (!hasNameField && !hasLatField && !hasLngField) {
    return null;
  }

  const name = hasNameField ? String(updates[nameField] || "").trim() : null;
  const lat = hasLatField ? parseCoordinate(updates[latField], latField) : null;
  const lng = hasLngField ? parseCoordinate(updates[lngField], lngField) : null;

  validateLatLng(lat, lng, label);

  const geohash = lat !== null && lng !== null ? encodeGeohash(lat, lng) : null;

  const shouldDelete =
    hasNameField &&
    hasLatField &&
    hasLngField &&
    !name &&
    lat === null &&
    lng === null;

  return {
    name,
    lat,
    lng,
    geohash,
    shouldDelete,
  };
}

async function upsertUserPlaceByLabel(userId, label, locationData) {
  const updateSql = `
    update ${USER_PLACES_TABLE}
    set name = $3,
        lat = $4,
        lng = $5,
        geohash = $6
    where user_id = $1::uuid
      and lower(label) = $2
  `;
  const updatedRows = await prisma.$executeRawUnsafe(
    updateSql,
    userId,
    label,
    locationData.name,
    locationData.lat,
    locationData.lng,
    locationData.geohash,
  );

  if (updatedRows > 0) {
    return;
  }

  const insertSql = `
    insert into ${USER_PLACES_TABLE} (user_id, label, name, lat, lng, geohash)
    values ($1::uuid, $2, $3, $4, $5, $6)
  `;
  await prisma.$executeRawUnsafe(
    insertSql,
    userId,
    label,
    locationData.name,
    locationData.lat,
    locationData.lng,
    locationData.geohash,
  );
}

async function deleteUserPlaceByLabel(userId, label) {
  const deleteSql = `
    delete from ${USER_PLACES_TABLE}
    where user_id = $1::uuid
      and lower(label) = $2
  `;
  await prisma.$executeRawUnsafe(deleteSql, userId, label);
}

export async function fetchProfile(authUser) {
  const columnMapping = await getProfileColumnMapping();
  const placesCapabilities = await getUserPlacesCapabilities();
  const row = await getProfileRowByUserAuthId(authUser.id, columnMapping);
  const profileUserId = row?.user_id || null;
  let placeValues = {
    home_location: "",
    home_lat: null,
    home_lng: null,
    home_geohash: "",
    work_location: "",
    work_lat: null,
    work_lng: null,
    work_geohash: "",
  };

  if (
    placesCapabilities.hasTable &&
    placesCapabilities.hasUserId &&
    placesCapabilities.hasLabel &&
    placesCapabilities.hasName &&
    placesCapabilities.hasLat &&
    placesCapabilities.hasLng &&
    placesCapabilities.hasGeohash &&
    profileUserId
  ) {
    placeValues = await getUserPlacesByLabel(profileUserId);
  }

  const profile = shapeProfileResponse(row, columnMapping, authUser);
  profile.home_location = placeValues.home_location;
  profile.home_lat = placeValues.home_lat;
  profile.home_lng = placeValues.home_lng;
  profile.home_geohash = placeValues.home_geohash;
  profile.work_location = placeValues.work_location;
  profile.work_lat = placeValues.work_lat;
  profile.work_lng = placeValues.work_lng;
  profile.work_geohash = placeValues.work_geohash;

  return {
    profile,
    supported_fields: {
      display_name: Boolean(columnMapping.display_name),
      email: Boolean(columnMapping.email),
      phone_number: Boolean(columnMapping.phone_number),
      home_location:
        placesCapabilities.hasTable &&
        placesCapabilities.hasUserId &&
        placesCapabilities.hasLabel &&
        placesCapabilities.hasName &&
        placesCapabilities.hasLat &&
        placesCapabilities.hasLng &&
        placesCapabilities.hasGeohash &&
        Boolean(profileUserId),
      work_location:
        placesCapabilities.hasTable &&
        placesCapabilities.hasUserId &&
        placesCapabilities.hasLabel &&
        placesCapabilities.hasName &&
        placesCapabilities.hasLat &&
        placesCapabilities.hasLng &&
        placesCapabilities.hasGeohash &&
        Boolean(profileUserId),
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
  const placesCapabilities = await getUserPlacesCapabilities();
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

  const profileRowForPlaces = await getProfileRowByUserAuthId(authUser.id, columnMapping);
  const profileUserId = profileRowForPlaces?.user_id || null;
  const canWritePlaces =
    placesCapabilities.hasTable &&
    placesCapabilities.hasUserId &&
    placesCapabilities.hasLabel &&
    placesCapabilities.hasName &&
    placesCapabilities.hasLat &&
    placesCapabilities.hasLng &&
    placesCapabilities.hasGeohash &&
    Boolean(profileUserId);

  const homeLocationInput = normalizeLocationInput(updates, HOME_PLACE_LABEL);
  if (canWritePlaces && homeLocationInput) {
    if (homeLocationInput.shouldDelete) {
      await deleteUserPlaceByLabel(profileUserId, HOME_PLACE_LABEL);
    } else {
      await upsertUserPlaceByLabel(profileUserId, HOME_PLACE_LABEL, homeLocationInput);
    }
  }

  const workLocationInput = normalizeLocationInput(updates, WORK_PLACE_LABEL);
  if (canWritePlaces && workLocationInput) {
    if (workLocationInput.shouldDelete) {
      await deleteUserPlaceByLabel(profileUserId, WORK_PLACE_LABEL);
    } else {
      await upsertUserPlaceByLabel(profileUserId, WORK_PLACE_LABEL, workLocationInput);
    }
  }

  const refreshedRow = await getProfileRowByUserAuthId(authUser.id, columnMapping);
  let placeValues = {
    home_location: "",
    home_lat: null,
    home_lng: null,
    home_geohash: "",
    work_location: "",
    work_lat: null,
    work_lng: null,
    work_geohash: "",
  };

  if (canWritePlaces) {
    placeValues = await getUserPlacesByLabel(profileUserId);
  }

  const profile = shapeProfileResponse(refreshedRow, columnMapping, authUserForResponse);
  profile.home_location = placeValues.home_location;
  profile.home_lat = placeValues.home_lat;
  profile.home_lng = placeValues.home_lng;
  profile.home_geohash = placeValues.home_geohash;
  profile.work_location = placeValues.work_location;
  profile.work_lat = placeValues.work_lat;
  profile.work_lng = placeValues.work_lng;
  profile.work_geohash = placeValues.work_geohash;
  const ignoredFields = updateKeys.filter((field) => {
    if (
      field === "home_location" ||
      field === "home_lat" ||
      field === "home_lng" ||
      field === "work_location" ||
      field === "work_lat" ||
      field === "work_lng"
    ) {
      return !canWritePlaces;
    }

    return !columnMapping[field];
  });

  return {
    message: "Profile updated successfully.",
    profile,
    ignored_fields: ignoredFields,
  };
}
