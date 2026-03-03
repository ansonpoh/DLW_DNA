import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const TELEGRAM_FILE_BASE = "https://api.telegram.org/file";

function ensureTelegramBotConfigured() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new HttpError(500, "TELEGRAM_BOT_TOKEN is not configured.");
  }
}

async function callTelegramApi(method, body) {
  ensureTelegramBotConfigured();
  const url = `${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });

  if (!response.ok) {
    throw new HttpError(502, `Telegram API call failed for ${method}.`);
  }

  const payload = await response.json();
  if (!payload?.ok) {
    throw new HttpError(502, `Telegram API error for ${method}.`);
  }

  return payload.result;
}

export async function getTelegramFilePath(fileId) {
  const result = await callTelegramApi("getFile", { file_id: fileId });
  const path = String(result?.file_path || "").trim();
  if (!path) {
    throw new HttpError(502, "Telegram did not return file_path for voice file.");
  }
  return path;
}

export async function downloadTelegramFile(filePath) {
  ensureTelegramBotConfigured();
  const url = `${TELEGRAM_FILE_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new HttpError(502, "Unable to download voice file from Telegram.");
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function sendTelegramMessage(chatId, text) {
  if (!chatId) {
    return null;
  }

  return callTelegramApi("sendMessage", {
    chat_id: chatId,
    text,
  });
}
