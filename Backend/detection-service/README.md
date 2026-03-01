# DLW DNA Detection Service (Python)

## Setup

```bash
cd Backend/detection-service
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
copy .env.example .env
```

## Run

```bash
uvicorn main:app --host 0.0.0.0 --port 3011 --reload
```

## API

- `GET /health`
- `POST /api/detection/ingest` with header `x-detection-key`
- `POST /api/detection/start-camera` with header `x-detection-admin-key`

`/api/detection/ingest` forwards accident payloads to `SERVER_REPORT_INGEST_URL`.
