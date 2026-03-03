import { Router } from "express";
import { postTelegramWebhook } from "../controllers/telegramController.js";

const router = Router();

router.post("/webhook", postTelegramWebhook);

export default router;
