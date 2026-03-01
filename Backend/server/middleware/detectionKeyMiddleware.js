import { env } from "../config/env.js";

export function requireDetectionIngestKey(req, res, next) {
  if (!env.DETECTION_INGEST_KEY) {
    return res.status(503).json({ message: "Detection ingest key is not configured." });
  }

  const incomingKey = String(req.headers["x-detection-key"] || "").trim();
  if (!incomingKey || incomingKey !== env.DETECTION_INGEST_KEY) {
    return res.status(401).json({ message: "Invalid detection ingest key." });
  }

  return next();
}
