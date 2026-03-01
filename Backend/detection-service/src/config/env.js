import dotenv from "dotenv";

dotenv.config();

const requiredEnvVars = ["DATABASE_URL", "DETECTION_INGEST_KEY", "DETECTION_ADMIN_KEY"];
const missingEnvVars = requiredEnvVars.filter(
  (variableName) => !String(process.env[variableName] || "").trim(),
);

if (missingEnvVars.length) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
}

export const env = {
  PORT: process.env.PORT || 3011,
  CLIENT_URL: process.env.CLIENT_URL || "*",
  DATABASE_URL: process.env.DATABASE_URL,
  DETECTION_INGEST_KEY: process.env.DETECTION_INGEST_KEY,
  DETECTION_ADMIN_KEY: process.env.DETECTION_ADMIN_KEY,
};
