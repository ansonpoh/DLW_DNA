import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

function normalizeCountryCode(countryCode) {
  const normalized = String(countryCode || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (!/^[a-z]{2}$/.test(normalized)) {
    throw new HttpError(400, "Country code must be a 2-letter ISO code (e.g. sg, us).");
  }
  return normalized;
}

function parseCoordinate(rawValue, fieldName) {
  const value = Number(rawValue);
  if (Number.isNaN(value)) {
    throw new HttpError(502, `Geocoder returned an invalid ${fieldName} value.`);
  }
  return value;
}

export async function geocodePostalCode(payload) {
  const postalCode = String(payload?.postal_code || "").trim();
  const countryCodeInput =
    String(payload?.country_code || "").trim() ||
    env.DEFAULT_POSTAL_COUNTRY_CODE;
  const countryCode = normalizeCountryCode(countryCodeInput);

  if (!postalCode) {
    throw new HttpError(400, "Postal code is required.");
  }

  const searchQuery = countryCode ? `${postalCode} ${countryCode}` : postalCode;
  const requestUrl = new URL("https://nominatim.openstreetmap.org/search");
  requestUrl.searchParams.set("q", searchQuery);
  requestUrl.searchParams.set("format", "jsonv2");
  requestUrl.searchParams.set("addressdetails", "1");
  requestUrl.searchParams.set("limit", "1");
  if (countryCode) {
    requestUrl.searchParams.set("countrycodes", countryCode);
  }

  const response = await fetch(requestUrl, {
    headers: {
      "User-Agent": env.GEOCODING_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new HttpError(502, "Postal code lookup failed. Please try again.");
  }

  const results = await response.json();
  const firstResult = Array.isArray(results) ? results[0] : null;

  if (!firstResult) {
    throw new HttpError(404, "Postal code not found.");
  }

  const lat = parseCoordinate(firstResult.lat, "latitude");
  const lng = parseCoordinate(firstResult.lon, "longitude");

  return {
    postal_code: postalCode,
    country_code: countryCode,
    lat,
    lng,
    display_name: String(firstResult.display_name || ""),
  };
}
