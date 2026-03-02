from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

from .config import settings
from .models import ReportForwardRequest, TranscriptionResponse, TranscriptionResult
from .server_client import publisher
from .transcriber import transcriber

app = FastAPI(title="DLW DNA STT Service", version="1.0.0")


def _check_ingest_key(incoming: str | None) -> None:
    expected = settings.stt_ingest_key
    if expected and incoming != expected:
        raise HTTPException(status_code=401, detail="Invalid STT ingest key.")


def _build_report_description(
    transcript: str,
    source_id: str | None,
    source_filename: str,
) -> str:
    source = (source_id or "").strip()
    if source:
        return f"Transcribed audio report from {source}. Transcript: {transcript}"
    return f"Transcribed audio report from file {source_filename}. Transcript: {transcript}"


def _build_server_payload(
    transcript: str,
    source_filename: str,
    report_info: ReportForwardRequest,
) -> dict[str, object]:
    return {
        "type": report_info.report_type,
        "description": _build_report_description(
            transcript=transcript,
            source_id=report_info.source_id,
            source_filename=source_filename,
        ),
        "happening_now": report_info.happening_now,
        "safe_to_continue": report_info.safe_to_continue,
        "location_label": report_info.location_label or "",
        "location_source": "audio",
        "latitude": report_info.latitude,
        "longitude": report_info.longitude,
        "priority": report_info.priority,
        "status": "submitted",
    }


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "stt-service", "status": "ok"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/stt/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: str | None = Form(default=None),
    task: Literal["transcribe", "translate"] = Form(default="transcribe"),
    forward_report: bool = Form(default=True),
    report_type: str = Form(default="Audio Incident Report"),
    location_label: str | None = Form(default=None),
    latitude: float | None = Form(default=None),
    longitude: float | None = Form(default=None),
    happening_now: bool = Form(default=True),
    safe_to_continue: bool = Form(default=True),
    priority: Literal["Low", "Medium", "High", "Critical"] = Form(default="Medium"),
    source_id: str | None = Form(default=None),
    x_stt_key: str | None = Header(default=None),
) -> TranscriptionResponse:
    _check_ingest_key(x_stt_key)

    filename = audio.filename or "audio-upload.bin"
    payload = await audio.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

    suffix = Path(filename).suffix or ".bin"
    temp_audio_path: str | None = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(payload)
            temp_audio_path = temp_file.name

        transcript = transcriber.transcribe_file(
            temp_audio_path,
            language=(language or "").strip() or None,
            task=task,
        )
    except RuntimeError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"STT transcription failed: {error}") from error
    finally:
        if temp_audio_path and os.path.exists(temp_audio_path):
            os.unlink(temp_audio_path)

    transcription_result = TranscriptionResult(
        text=transcript.text,
        language=transcript.language,
        language_probability=transcript.language_probability,
        duration_seconds=transcript.duration_seconds,
        model=settings.whisper_model,
    )

    report_forwarded = False
    server_status: int | None = None

    if forward_report:
        report_info = ReportForwardRequest(
            report_type=report_type,
            location_label=location_label,
            latitude=latitude,
            longitude=longitude,
            happening_now=happening_now,
            safe_to_continue=safe_to_continue,
            priority=priority,
            source_id=source_id,
        )
        server_payload = _build_server_payload(transcript.text, filename, report_info)
        response = publisher.publish_report(server_payload)
        if response.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"Main server rejected transcribed report ({response.status_code}): {response.text}",
            )
        report_forwarded = True
        server_status = response.status_code

    return TranscriptionResponse(
        message="Audio transcribed successfully.",
        transcription=transcription_result,
        report_forwarded=report_forwarded,
        server_status=server_status,
    )
