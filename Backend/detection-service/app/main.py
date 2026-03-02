from __future__ import annotations

import logging
import threading

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from .config import settings
from .detector import analyze_media_bytes, get_detector_status, run_camera_detection_loop
from .models import AccidentEvent, DetectionIngestResponse, IncidentAnalysisResponse
from .notifier import email_notifier
from .server_client import publisher

app = FastAPI(title="DLW DNA Detection Service", version="2.0.0")
logger = logging.getLogger(__name__)
_camera_thread_lock = threading.Lock()
_camera_thread: threading.Thread | None = None


def _check_ingest_key(incoming: str | None) -> None:
    expected = settings.detection_ingest_key
    if expected and incoming != expected:
        raise HTTPException(status_code=401, detail="Invalid detection ingest key.")


def _check_admin_key(incoming: str | None) -> None:
    expected = settings.detection_admin_key
    if expected and incoming != expected:
        raise HTTPException(status_code=401, detail="Invalid detection admin key.")


def _forward_event(event: AccidentEvent) -> int:
    logger.info(
        "Forwarding accident event camera_id=%s confidence=%.3f",
        event.camera_id,
        event.confidence,
    )
    response = publisher.publish_accident(event)
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Report pipeline rejected accident payload ({response.status_code}): {response.text}",
        )
    email_notifier.send_accident_email(event)
    return response.status_code


def _camera_worker() -> None:
    try:
        run_camera_detection_loop(lambda event: _forward_event(event))
    except Exception as error:
        logger.exception("Camera worker failed: %s", error)


def _start_camera_thread_if_needed() -> bool:
    global _camera_thread
    with _camera_thread_lock:
        if _camera_thread and _camera_thread.is_alive():
            return False
        worker = threading.Thread(target=_camera_worker, daemon=True, name="camera-detection-worker")
        worker.start()
        _camera_thread = worker
        return True


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
    started = _start_camera_thread_if_needed()
    if started:
        logger.info("Camera detection loop start requested.")
        return JSONResponse(status_code=202, content={"message": "Camera detection loop started."})
    return JSONResponse(status_code=200, content={"message": "Camera detection loop is already running."})


@app.post("/api/detection/analyze-media", response_model=IncidentAnalysisResponse)
async def analyze_media(
    media: UploadFile = File(...),
    source_id: str = Form(default=settings.camera_id),
    location_label: str | None = Form(default=None),
    latitude: float | None = Form(default=None),
    longitude: float | None = Form(default=None),
    forward_event: bool = Form(default=True),
    x_detection_key: str | None = Header(default=None),
) -> IncidentAnalysisResponse:
    _check_ingest_key(x_detection_key)
    payload = await media.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        analysis = analyze_media_bytes(media.filename or "upload.bin", payload)
    except RuntimeError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    event_forwarded = False
    server_status: int | None = None

    if forward_event and analysis.confidence >= settings.incident_confidence_threshold:
        metadata = dict(analysis.metadata)
        metadata["incident_type"] = analysis.incident_type
        metadata["source_filename"] = media.filename or "uploaded-media"
        event = AccidentEvent(
            camera_id=source_id,
            confidence=analysis.confidence,
            description=f"Inferred incident type: {analysis.incident_type}",
            location_label=location_label,
            latitude=latitude,
            longitude=longitude,
            metadata=metadata,
            evidence_images=analysis.evidence_images,
        )
        server_status = _forward_event(event)
        event_forwarded = True

    return IncidentAnalysisResponse(
        message="Media analyzed successfully.",
        incident_type=analysis.incident_type,
        confidence=analysis.confidence,
        model_backend=analysis.model_backend,
        frames_analyzed=analysis.frames_analyzed,
        event_forwarded=event_forwarded,
        server_status=server_status,
        metadata=analysis.metadata,
    )


@app.get("/api/detection/status")
def detection_status(
    x_detection_admin_key: str | None = Header(default=None),
) -> dict[str, object]:
    _check_admin_key(x_detection_admin_key)
    runtime = get_detector_status()
    worker_alive = bool(_camera_thread and _camera_thread.is_alive())
    return {
        "worker_alive": worker_alive,
        "camera_source": settings.camera_source,
        "camera_id": settings.camera_id,
        "runtime": runtime,
    }


@app.on_event("startup")
def startup() -> None:
    if settings.run_camera:
        _start_camera_thread_if_needed()
