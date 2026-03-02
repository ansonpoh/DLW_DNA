from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "3011"))
    detection_ingest_key: str = os.getenv("DETECTION_INGEST_KEY", "")
    detection_admin_key: str = os.getenv("DETECTION_ADMIN_KEY", "")
    run_camera: bool = os.getenv("RUN_CAMERA", "false").lower() == "true"
    camera_source: str = os.getenv("CAMERA_SOURCE", "0")
    camera_id: str = os.getenv("CAMERA_ID", "CAM-01")
    motion_area_threshold: int = int(os.getenv("MOTION_AREA_THRESHOLD", "28000"))
    accident_confidence_threshold: float = float(os.getenv("ACCIDENT_CONFIDENCE_THRESHOLD", "0.75"))
    detection_cooldown_seconds: int = int(os.getenv("DETECTION_COOLDOWN_SECONDS", "20"))
    detector_backend: str = os.getenv("DETECTOR_BACKEND", "yolo").lower()
    yolo_model_path: str = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")
    yolo_conf_threshold: float = float(os.getenv("YOLO_CONF_THRESHOLD", "0.30"))
    yolo_device: str = os.getenv("YOLO_DEVICE", "cpu")
    yolo_vehicle_class_ids: str = os.getenv("YOLO_VEHICLE_CLASS_IDS", "2,3,5,7")
    server_report_ingest_url: str = os.getenv(
        "SERVER_REPORT_INGEST_URL", "http://localhost:3001/api/reports/detection"
    )
    server_detection_key: str = os.getenv("SERVER_DETECTION_KEY", "")
    request_timeout_seconds: float = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "10"))


settings = Settings()
