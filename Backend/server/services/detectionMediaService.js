import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

function withTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

export async function analyzeMediaForIncident(mediaBuffer, options = {}) {
  if (!Buffer.isBuffer(mediaBuffer) || mediaBuffer.length === 0) {
    throw new HttpError(400, "Media buffer is empty.");
  }

  if (!env.DETECTION_MEDIA_ANALYZE_URL) {
    throw new HttpError(500, "DETECTION_MEDIA_ANALYZE_URL is not configured.");
  }

  const filename = String(options.filename || "telegram-upload.bin").trim() || "telegram-upload.bin";
  const sourceId = String(options.sourceId || "telegram-bot").trim() || "telegram-bot";

  const form = new FormData();
  form.append("media", new Blob([mediaBuffer]), filename);
  form.append("source_id", sourceId);
  form.append("forward_event", "false");

  if (options.locationLabel) {
    form.append("location_label", String(options.locationLabel).trim());
  }
  if (options.latitude !== undefined && options.latitude !== null && options.latitude !== "") {
    form.append("latitude", String(options.latitude));
  }
  if (options.longitude !== undefined && options.longitude !== null && options.longitude !== "") {
    form.append("longitude", String(options.longitude));
  }

  const timeoutMs = Number.isFinite(env.DETECTION_MEDIA_TIMEOUT_MS)
    ? Math.max(1000, env.DETECTION_MEDIA_TIMEOUT_MS)
    : 15000;
  const { signal, clear } = withTimeoutSignal(timeoutMs);

  try {
    const response = await fetch(env.DETECTION_MEDIA_ANALYZE_URL, {
      method: "POST",
      headers: {
        "x-detection-key": env.DETECTION_MEDIA_KEY,
      },
      body: form,
      signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        String(data?.detail || data?.message || "").trim() ||
        `Detection media analysis failed (${response.status}).`;
      throw new HttpError(502, message);
    }

    return {
      incidentType: String(data?.incident_type || "no_clear_incident").trim(),
      confidence: Number(data?.confidence || 0),
      modelBackend: String(data?.model_backend || "").trim(),
      framesAnalyzed: Number(data?.frames_analyzed || 0),
      metadata: data?.metadata && typeof data.metadata === "object" ? data.metadata : {},
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    if (error?.name === "AbortError") {
      throw new HttpError(504, "Detection media analysis timed out.");
    }
    throw new HttpError(
      502,
      `Unable to call detection media analysis service: ${error?.message || "unknown error"}`,
    );
  } finally {
    clear();
  }
}
