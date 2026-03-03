import { env } from "../config/env.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";

function ensureToken() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN in environment.");
  }
}

async function callTelegram(method, body = {}) {
  ensureToken();
  const url = `${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(`Telegram ${method} failed: ${payload?.description || response.statusText}`);
  }
  return payload.result;
}

async function setWebhook() {
  if (!env.TELEGRAM_WEBHOOK_URL) {
    throw new Error("Missing TELEGRAM_WEBHOOK_URL in environment.");
  }
  const webhookUrl = env.TELEGRAM_WEBHOOK_URL.endsWith("/api/telegram/webhook")
    ? env.TELEGRAM_WEBHOOK_URL
    : `${env.TELEGRAM_WEBHOOK_URL.replace(/\/+$/, "")}/api/telegram/webhook`;

  const result = await callTelegram("setWebhook", {
    url: webhookUrl,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET || undefined,
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: true,
  });
  console.log("Webhook set successfully.");
  console.log(JSON.stringify(result, null, 2));
}

async function webhookInfo() {
  const result = await callTelegram("getWebhookInfo");
  console.log(JSON.stringify(result, null, 2));
}

async function deleteWebhook() {
  const result = await callTelegram("deleteWebhook", {
    drop_pending_updates: true,
  });
  console.log("Webhook deleted.");
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const action = String(process.argv[2] || "set").trim().toLowerCase();
  if (action === "set") {
    await setWebhook();
    return;
  }
  if (action === "info") {
    await webhookInfo();
    return;
  }
  if (action === "delete") {
    await deleteWebhook();
    return;
  }

  throw new Error('Invalid action. Use: "set", "info", or "delete".');
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
