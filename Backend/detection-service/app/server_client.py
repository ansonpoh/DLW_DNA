from __future__ import annotations

import requests

from .config import settings
from .models import AccidentEvent


class ReportPublisher:
    def __init__(self) -> None:
        self._session = requests.Session()

    def publish_accident(self, event: AccidentEvent) -> requests.Response:
        if not settings.report_pipeline_key:
            raise RuntimeError("REPORT_PIPELINE_KEY is not configured.")

        payload = event.model_dump(mode="json")

        return self._session.post(
            settings.report_pipeline_ingest_url,
            json=payload,
            headers={"x-ai-admin-key": settings.report_pipeline_key},
            timeout=settings.request_timeout_seconds,
        )


publisher = ReportPublisher()
