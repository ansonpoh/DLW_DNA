# DLW DNA

DLW DNA is an AI-assisted public safety platform built around the idea of an "AI Safety Hivemind": one system that combines human safety reports with machine-detected risk signals to produce faster, more structured incident response.

The project supports both:

- Inbound human reports: text, audio, media, Telegram, and geolocated incident submissions.
- Outbound environmental signals: detection and enrichment pipelines that turn raw observations into structured dispatch-ready reports.

## What It Does

DLW DNA is designed to reduce the gap between what people report and what the system can already infer from location, media, and AI-assisted analysis.

Core capabilities include:

- User reporting flow with incident type, description, location, media upload, and voice-note support.
- Speech-to-text processing for audio reports.
- Media analysis for uploaded image/video evidence.
- AI-assisted enrichment and validation of reports before they reach the main backend.
- Location-aware agency routing and structured incident dispatch generation.
- Telegram bot / webhook workflow for conversational reporting.
- Admin-side report handling and public-safety style operational workflows.

## Architecture

The repo is split into a frontend and a multi-service backend:

- `Frontend/dlw`
  A Next.js web application for landing pages, dashboards, reporting flows, profile management, and admin UI.

- `Backend/server`
  The main Express backend for authentication, profile management, report submission, admin routes, Telegram routes, Prisma, and Supabase integration.

- `Backend/detection-service`
  A Python detection service that supports incident/media analysis and camera-style detection workflows.

- `Backend/ai-admin-service`
  A Python enrichment service that validates and enriches incoming reports using AI with fallback heuristics.

- `Backend/stt-service`
  A Python speech-to-text service used for audio report transcription.

- `Frontend/telegram`
  Telegram integration notes, demo artifacts, and sample dispatch outputs.

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, Axios
- Main backend: Node.js, Express, Prisma, Supabase
- AI / service layer: Python, FastAPI/Uvicorn-style services, OpenAI-assisted enrichment, STT pipeline
- Detection pipeline: Python media analysis / detection workflow
- Integrations: Telegram webhook flow, localtunnel, file/media upload handling
- Ops: Docker Compose

## Main Product Flows

### 1. Human report flow

Users can submit safety incidents through the web UI using:

- written descriptions
- uploaded audio
- recorded browser voice notes
- uploaded images or video
- selected or pinned locations

The system can then:

- transcribe audio
- analyze media
- classify or enrich the report
- attach structured metadata
- route it to the correct backend workflow

### 2. Detection / AI admin flow

The backend pipeline lets the system ingest machine-side events and turn them into structured reports:

1. Detection service receives a media or detection event.
2. AI admin service validates, enriches, and prioritizes it.
3. Main backend stores and routes the report.
4. Admin / agency workflows can process the result.

### 3. Telegram reporting flow

The Telegram integration supports bot-style reporting and webhook processing so users can send information through a messaging workflow instead of the web UI.

Supporting docs and samples live in:

- `Frontend/telegram/README.md`
- `Frontend/telegram/samples/agency-dispatch.json`
- `Frontend/telegram/samples/agency-summary.txt`

## Repository Structure

```text
DLW_DNA/
|-- Frontend/
|   |-- dlw/                 # Next.js application
|   `-- telegram/            # Telegram runbook + samples
|
`-- Backend/
    |-- server/              # Express API, Prisma, Supabase, auth, reports
    |-- detection-service/   # Media / detection pipeline
    |-- ai-admin-service/    # AI enrichment and validation
    |-- stt-service/         # Speech-to-text service
    `-- docker-compose.yml   # Local multi-service backend orchestration
```

## Quick Start

### Prerequisites

- Node.js
- Python
- Docker Desktop
- Supabase project credentials
- Optional: Telegram bot credentials
- Optional: OpenAI / STT provider credentials

### Backend

Start the backend service stack from the `Backend` folder:

```bash
cd Backend
docker compose up --build
```

This brings up:

- `server` on `3001`
- `detection-service` on `3011`
- `ai-admin-service` on `3012`
- `stt-service` on `3013`

Important backend environment values live in:

- `Backend/server/.env`
- `Backend/ai-admin-service/.env`
- `Backend/detection-service/.env`
- `Backend/stt-service/.env`

The main backend ships with an example file here:

- `Backend/server/.env.example`

### Frontend

Run the Next.js app from `Frontend/dlw`:

```bash
cd Frontend/dlw
npm install
npm run dev
```

Frontend environment values should include:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
DETECTION_SERVICE_BASE_URL=http://localhost:3011
DETECTION_INGEST_KEY=your_detection_ingest_key
```

Open:

- `http://localhost:3000`

## Useful Entry Points

### Frontend pages

- Landing page: `Frontend/dlw/app/page.tsx`
- User dashboard: `Frontend/dlw/app/dashboard/page.tsx`
- Report flow: `Frontend/dlw/app/dashboard/report/page.tsx`
- Admin pages: `Frontend/dlw/app/admin/...`

### Backend entry points

- Main API: `Backend/server/index.js`
- Detection service: `Backend/detection-service/main.py`
- AI admin service: `Backend/ai-admin-service/main.py`
- STT service: `Backend/stt-service/main.py`

## Why This Project Is Strong

DLW DNA is more than a single web app. It demonstrates:

- full-stack product thinking across frontend, backend, and AI-assisted services
- multi-service system design
- real integration work across media, speech, routing, and messaging
- location-aware workflows
- practical public-safety style product design
- a clear pipeline from messy raw input to structured operational output

## Notes

- This project is built as a public-safety support platform, not a replacement for emergency services.
- Some features depend on external credentials and service configuration before they can run end-to-end.
- For service-specific setup and runtime details, check the README files inside each backend service folder.
