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
    yolo_person_class_id: int = int(os.getenv("YOLO_PERSON_CLASS_ID", "0"))
    video_sample_every_n_frames: int = int(os.getenv("VIDEO_SAMPLE_EVERY_N_FRAMES", "5"))
    video_max_frames_analyzed: int = int(os.getenv("VIDEO_MAX_FRAMES_ANALYZED", "48"))
    incident_confidence_threshold: float = float(os.getenv("INCIDENT_CONFIDENCE_THRESHOLD", "0.55"))
    evidence_frame_count: int = int(os.getenv("EVIDENCE_FRAME_COUNT", "2"))
    evidence_jpeg_quality: int = int(os.getenv("EVIDENCE_JPEG_QUALITY", "75"))
    evidence_image_max_width: int = int(os.getenv("EVIDENCE_IMAGE_MAX_WIDTH", "960"))
    report_pipeline_ingest_url: str = (
        os.getenv("REPORT_PIPELINE_INGEST_URL")
        or os.getenv("SERVER_REPORT_INGEST_URL")
        or "http://localhost:3012/api/ai-admin/ingest"
    )
    report_pipeline_key: str = (
        os.getenv("REPORT_PIPELINE_KEY") or os.getenv("SERVER_DETECTION_KEY") or ""
    )
    request_timeout_seconds: float = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "10"))
    email_notifications_enabled: bool = os.getenv("EMAIL_NOTIFICATIONS_ENABLED", "false").lower() == "true"
    email_smtp_host: str = os.getenv("EMAIL_SMTP_HOST", "")
    email_smtp_port: int = int(os.getenv("EMAIL_SMTP_PORT", "587"))
    email_smtp_use_tls: bool = os.getenv("EMAIL_SMTP_USE_TLS", "true").lower() == "true"
    email_smtp_username: str = os.getenv("EMAIL_SMTP_USERNAME", "")
    email_smtp_password: str = os.getenv("EMAIL_SMTP_PASSWORD", "")
    email_from: str = os.getenv("EMAIL_FROM", "")
    email_to: str = os.getenv("EMAIL_TO", "")
    email_subject_prefix: str = os.getenv("EMAIL_SUBJECT_PREFIX", "[DLW DNA]")


settings = Settings()
