from __future__ import annotations

import requests

from .config import settings


class ServerPublisher:
    def __init__(self) -> None:
        self._session = requests.Session()

    def publish_report(self, payload: dict[str, object]) -> requests.Response:
        if not settings.server_detection_key:
            raise RuntimeError("SERVER_DETECTION_KEY is not configured.")

        return self._session.post(
            settings.server_report_ingest_url,
            json=payload,
            headers={"x-detection-key": settings.server_detection_key},
            timeout=settings.request_timeout_seconds,
        )


publisher = ServerPublisher()
