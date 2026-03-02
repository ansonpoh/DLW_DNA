from __future__ import annotations

import requests

from .config import settings
from .models import EnrichedAccidentReport


class ServerPublisher:
    def __init__(self) -> None:
        self._session = requests.Session()

    def publish_report(self, report: EnrichedAccidentReport) -> requests.Response:
        if not settings.server_detection_key:
            raise RuntimeError("SERVER_DETECTION_KEY is not configured.")

        return self._session.post(
            settings.server_report_ingest_url,
            json=report.model_dump(mode="json"),
            headers={"x-detection-key": settings.server_detection_key},
            timeout=settings.request_timeout_seconds,
        )


publisher = ServerPublisher()
