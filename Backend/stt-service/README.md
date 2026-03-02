# STT Service Run Commands

## Local (STT service only)

```bash
cd Backend/stt-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --host 0.0.0.0 --port 3013 --reload --env-file .env
```

## Docker Compose (full backend stack)

```bash
cd Backend
docker compose up --build
```
