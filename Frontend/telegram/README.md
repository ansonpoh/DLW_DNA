# Telegram Integration Runbook

This folder contains Telegram demo artifacts and sample agency output for the backend webhook flow.

## 1) Set required env vars (Backend/server/.env)

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `AI_ADMIN_KEY`
- `STT_PROVIDER`
- `STT_API_KEY`
- `AGENCY_ROUTING_MODE`

## 2) Apply DB migration

Run the SQL in:

- `Backend/server/prisma/migrations/20260302_telegram_integration.sql`

## 3) Run backend

```bash
cd Backend/server
npm install
npm run dev
```

## 4) Set Telegram webhook

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" ^
  -H "Content-Type: application/json" ^
  -d "{\"url\":\"https://<YOUR_PUBLIC_DOMAIN>/api/telegram/webhook\",\"secret_token\":\"<TELEGRAM_WEBHOOK_SECRET>\"}"
```

## 5) Test from Telegram app

1. Send plain text message to bot.
2. Send voice note to bot.
3. Share location with bot.

Expected result:

- Bot replies with report acknowledgement + report ID.
- Backend inserts into `reports.reports`.
- Backend writes agency payload to `reports.report_dispatches`.

## Demo sample output

- JSON: `Frontend/telegram/samples/agency-dispatch.json`
- Readable summary: `Frontend/telegram/samples/agency-summary.txt`
