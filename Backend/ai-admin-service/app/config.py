from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "3012"))
    ai_admin_ingest_key: str = os.getenv("AI_ADMIN_INGEST_KEY", "")
    server_report_ingest_url: str = os.getenv(
        "SERVER_REPORT_INGEST_URL", "http://localhost:3001/api/reports/detection"
    )
    server_detection_key: str = os.getenv("SERVER_DETECTION_KEY", "")
    request_timeout_seconds: float = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "12"))
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    openai_timeout_seconds: float = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "12"))


settings = Settings()
