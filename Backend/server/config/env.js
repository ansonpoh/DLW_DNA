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
};
