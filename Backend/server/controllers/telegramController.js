import { handleTelegramWebhook } from "../services/telegramService.js";

export function postTelegramWebhook(req, res) {
  // Telegram expects a fast webhook acknowledgment; process heavy work asynchronously.
  res.status(200).json({ ok: true, accepted: true });
  handleTelegramWebhook(req.body || {}, req.headers || {}).catch((error) => {
    console.error(
      "[telegram:webhook] async processing failed:",
      error?.message || String(error),
    );
  });
}
