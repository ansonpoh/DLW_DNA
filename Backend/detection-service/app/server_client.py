from __future__ import annotations

import requests

from .config import settings
from .models import AccidentEvent


class ReportPublisher:
    def __init__(self) -> None:
        self._session = requests.Session()

    def publish_accident(self, event: AccidentEvent) -> requests.Response:
        if not settings.server_detection_key:
            raise RuntimeError("SERVER_DETECTION_KEY is not configured.")

        description = event.description or (
            f"Accident-like motion detected by camera {event.camera_id} "
            f"(confidence {event.confidence:.2f})."
        )

        payload = {
            "type": "Accident",
            "description": description,
            "happening_now": True,
            "safe_to_continue": False,
            "location_label": event.location_label or f"Camera {event.camera_id}",
            "location_source": "camera",
            "latitude": event.latitude,
            "longitude": event.longitude,
            "priority": "High",
            "status": "submitted",
            "camera_id": event.camera_id,
            "confidence": event.confidence,
            "detected_at": event.detected_at.isoformat(),
            "metadata": event.metadata,
        }

        return self._session.post(
            settings.server_report_ingest_url,
            json=payload,
            headers={"x-detection-key": settings.server_detection_key},
            timeout=settings.request_timeout_seconds,
        )


publisher = ReportPublisher()
