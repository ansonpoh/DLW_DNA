from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "3013"))
    stt_ingest_key: str = os.getenv("STT_INGEST_KEY", "")
    request_timeout_seconds: float = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "12"))
    server_report_ingest_url: str = os.getenv(
        "SERVER_REPORT_INGEST_URL", "http://localhost:3001/api/reports/detection"
    )
    server_detection_key: str = os.getenv("SERVER_DETECTION_KEY", "")
    whisper_model: str = os.getenv("WHISPER_MODEL", "tiny")
    whisper_device: str = os.getenv("WHISPER_DEVICE", "cpu")
    whisper_compute_type: str = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
    whisper_num_workers: int = int(os.getenv("WHISPER_NUM_WORKERS", "1"))


settings = Settings()
