# DLW DNA AI Admin Service (Python)

Independent service that sits between the detection service and the main backend:

1. receives raw detection event payloads
2. receives up to 3 attached JPEG evidence frames from detection service
3. validates and enriches the report using OpenAI (with fallback heuristics)
4. assigns severity and priority
5. suppresses duplicate event retries for a short TTL window
6. forwards the polished report to `POST /api/reports/detection` on the main server

## Setup

```bash
cd Backend/ai-admin-service
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
copy .env.example .env
```

## Run

```bash
uvicorn main:app --host 0.0.0.0 --port 3012 --reload --env-file .env
```

## API

- `GET /health`
- `POST /api/ai-admin/ingest` with header `x-ai-admin-key`
