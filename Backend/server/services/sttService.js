import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

const SUPPORTED_PRIORITIES = new Set(["Low", "Medium", "High", "Critical"]);

function withTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

function normalizePriority(value) {
  const candidate = String(value || "").trim();
  return SUPPORTED_PRIORITIES.has(candidate) ? candidate : "Medium";
}

function normalizeTask(value) {
  const candidate = String(value || "").trim().toLowerCase();
  return candidate === "translate" ? "translate" : "transcribe";
}

function resolveSttProvider() {
  const provider = String(env.STT_PROVIDER || "").trim().toLowerCase();
  if (provider) {
    return provider;
  }
  if (env.STT_API_KEY) {
    return "openai";
  }
  return "service";
}

function ensureSttServiceConfigured() {
  if (!env.STT_SERVICE_TRANSCRIBE_URL) {
    throw new HttpError(500, "STT service URL is not configured.");
  }
}

function ensureOpenAiConfigured() {
  if (!env.STT_API_KEY) {
    throw new HttpError(500, "STT_API_KEY is not configured.");
  }
}

async function callSttService(form) {
  ensureSttServiceConfigured();

  const timeoutMs = Number.isFinite(env.STT_SERVICE_TIMEOUT_MS)
    ? Math.max(2000, env.STT_SERVICE_TIMEOUT_MS)
    : 20000;
  const { signal, clear } = withTimeoutSignal(timeoutMs);

  try {
    const response = await fetch(env.STT_SERVICE_TRANSCRIBE_URL, {
      method: "POST",
      headers: {
        ...(env.STT_SERVICE_KEY ? { "x-stt-key": env.STT_SERVICE_KEY } : {}),
      },
      body: form,
      signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        String(data?.detail || data?.message || "").trim() ||
        `STT service request failed (${response.status}).`;
      throw new HttpError(502, message);
    }

    const transcript = String(data?.transcription?.text || "").trim();
    if (!transcript) {
      throw new HttpError(502, "STT service returned an empty transcript.");
    }

    return {
      text: transcript,
      language: String(data?.transcription?.language || "").trim(),
      language_probability: Number(data?.transcription?.language_probability || 0),
      duration_seconds: Number(data?.transcription?.duration_seconds || 0),
      model: String(data?.transcription?.model || "").trim(),
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    if (error?.name === "AbortError") {
      throw new HttpError(504, "STT service timed out.");
    }
    throw new HttpError(502, `Unable to call STT service: ${error?.message || "unknown error"}`);
  } finally {
    clear();
  }
}

async function transcribeWithOpenAi(voiceBuffer) {
  ensureOpenAiConfigured();

  const form = new FormData();
  const blob = new Blob([voiceBuffer], { type: "audio/ogg" });
  form.append("file", blob, "telegram-voice.ogg");
  form.append("model", "whisper-1");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STT_API_KEY}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new HttpError(502, "STT transcription request failed.");
  }

  const data = await response.json();
  const transcript = String(data?.text || "").trim();
  if (!transcript) {
    throw new HttpError(422, "Voice transcription produced no text.");
  }
  return transcript;
}

export async function transcribeAudioViaSttService(file, options = {}) {
  if (!file?.buffer || !file?.originalname) {
    throw new HttpError(400, "Audio file is required.");
  }

  const form = new FormData();
  form.append(
    "audio",
    new Blob([file.buffer], { type: file.mimetype || "application/octet-stream" }),
    file.originalname,
  );
  form.append("task", normalizeTask(options.task));
  form.append("forward_report", "false");
  form.append("report_type", String(options.report_type || "Audio Incident Report").trim());
  form.append("happening_now", String(options.happening_now ?? true));
  form.append("safe_to_continue", String(options.safe_to_continue ?? true));
  form.append("priority", normalizePriority(options.priority));

  if (options.language) {
    form.append("language", String(options.language).trim());
  }
  if (options.location_label) {
    form.append("location_label", String(options.location_label).trim());
  }
  if (options.latitude !== undefined && options.latitude !== null && options.latitude !== "") {
    form.append("latitude", String(options.latitude));
  }
  if (options.longitude !== undefined && options.longitude !== null && options.longitude !== "") {
    form.append("longitude", String(options.longitude));
  }
  if (options.source_id) {
    form.append("source_id", String(options.source_id).trim());
  }

  return callSttService(form);
}

async function transcribeBufferViaSttService(voiceBuffer) {
  const form = new FormData();
  form.append("audio", new Blob([voiceBuffer], { type: "audio/ogg" }), "telegram-voice.ogg");
  form.append("task", "transcribe");
  form.append("forward_report", "false");
  form.append("report_type", "Telegram Voice Report");
  form.append("happening_now", "true");
  form.append("safe_to_continue", "true");
  form.append("priority", "Medium");

  const result = await callSttService(form);
  return result.text;
}

export async function transcribeVoiceBuffer(voiceBuffer) {
  if (!Buffer.isBuffer(voiceBuffer) || voiceBuffer.length === 0) {
    throw new HttpError(400, "Voice buffer is empty.");
  }

  const provider = resolveSttProvider();
  if (provider === "openai" || provider === "whisper") {
    return transcribeWithOpenAi(voiceBuffer);
  }
  if (provider === "service" || provider === "stt-service" || provider === "internal") {
    return transcribeBufferViaSttService(voiceBuffer);
  }

  throw new HttpError(500, `Unsupported STT provider: ${provider}`);
}
