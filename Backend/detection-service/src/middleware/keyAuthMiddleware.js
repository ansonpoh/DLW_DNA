import { env } from "../config/env.js";

export function requireDetectionIngestKey(req, res, next) {
  const incomingKey = String(req.headers["x-detection-key"] || "").trim();
  if (!incomingKey || incomingKey !== env.DETECTION_INGEST_KEY) {
    return res.status(401).json({ message: "Invalid detection ingest key." });
  }
  return next();
}

export function requireDetectionAdminKey(req, res, next) {
  const incomingKey = String(req.headers["x-detection-admin-key"] || "").trim();
  if (!incomingKey || incomingKey !== env.DETECTION_ADMIN_KEY) {
    return res.status(401).json({ message: "Invalid detection admin key." });
  }
  return next();
}
