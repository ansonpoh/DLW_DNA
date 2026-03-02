import dotenv from "dotenv";

dotenv.config();

const requiredEnvVars = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
];

const missingEnvVars = requiredEnvVars.filter(
  (variableName) => !process.env[variableName],
);

if (missingEnvVars.length) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`,
  );
}

export const env = {
  PORT: process.env.PORT || 3001,
  CLIENT_URL: process.env.CLIENT_URL || "*",
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  GEOCODING_USER_AGENT:
    process.env.GEOCODING_USER_AGENT || "dlw-dna/1.0 (postal-geocode)",
  DEFAULT_POSTAL_COUNTRY_CODE:
    process.env.DEFAULT_POSTAL_COUNTRY_CODE || "sg",
  DETECTION_INGEST_KEY: String(process.env.DETECTION_INGEST_KEY || "").trim(),
  DETECTION_REPORT_USER_ID: String(process.env.DETECTION_REPORT_USER_ID || "").trim(),
  AI_ADMIN_ENRICH_URL: String(
    process.env.AI_ADMIN_ENRICH_URL ||
      "http://localhost:3012/api/ai-admin/enrich-user-report",
  ).trim(),
  AI_ADMIN_KEY: String(process.env.AI_ADMIN_KEY || "").trim(),
  AI_ADMIN_TIMEOUT_MS: Number(process.env.AI_ADMIN_TIMEOUT_MS || 8000),
};
