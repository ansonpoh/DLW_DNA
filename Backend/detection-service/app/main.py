from __future__ import annotations

import threading

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse

from .config import settings
from .detector import run_camera_detection_loop
from .models import AccidentEvent, DetectionIngestResponse
from .server_client import publisher

app = FastAPI(title="DLW DNA Detection Service", version="2.0.0")


def _check_ingest_key(incoming: str | None) -> None:
    expected = settings.detection_ingest_key
    if expected and incoming != expected:
        raise HTTPException(status_code=401, detail="Invalid detection ingest key.")


def _check_admin_key(incoming: str | None) -> None:
    expected = settings.detection_admin_key
    if expected and incoming != expected:
        raise HTTPException(status_code=401, detail="Invalid detection admin key.")


def _forward_event(event: AccidentEvent) -> int:
    response = publisher.publish_accident(event)
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Main server rejected accident payload ({response.status_code}): {response.text}",
        )
    return response.status_code


def _camera_worker() -> None:
    run_camera_detection_loop(lambda event: _forward_event(event))


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "detection-service", "status": "ok"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/detection/ingest", response_model=DetectionIngestResponse)
def ingest_detection(
    event: AccidentEvent,
    x_detection_key: str | None = Header(default=None),
) -> DetectionIngestResponse:
    _check_ingest_key(x_detection_key)
    status = _forward_event(event)
    return DetectionIngestResponse(message="Accident event forwarded.", server_status=status)


@app.post("/api/detection/start-camera")
def start_camera(
    x_detection_admin_key: str | None = Header(default=None),
) -> JSONResponse:
    _check_admin_key(x_detection_admin_key)
    worker = threading.Thread(target=_camera_worker, daemon=True)
    worker.start()
    return JSONResponse(status_code=202, content={"message": "Camera detection loop started."})


@app.on_event("startup")
def startup() -> None:
    if settings.run_camera:
        worker = threading.Thread(target=_camera_worker, daemon=True)
        worker.start()
