from __future__ import annotations

import logging
import threading
import time

from fastapi import FastAPI, Header, HTTPException

from .config import settings
from .enricher import enricher
from .models import (
    AccidentEvent,
    AiEnrichmentResult,
    EnrichedAccidentReport,
    PipelineIngestResponse,
    UserReportDraft,
    UserReportEnrichmentResult,
)
from .server_client import publisher

app = FastAPI(title="DLW DNA AI Admin Service", version="1.0.0")
logger = logging.getLogger(__name__)
_dedupe_lock = threading.Lock()
_recent_event_fingerprints: dict[str, float] = {}
_EVENT_DEDUPE_TTL_SECONDS = 180


def _check_ingest_key(incoming: str | None) -> None:
    expected = settings.ai_admin_ingest_key
    if expected and incoming != expected:
        raise HTTPException(status_code=401, detail="Invalid AI admin ingest key.")


def _build_report(event: AccidentEvent) -> tuple[EnrichedAccidentReport, bool]:
    enriched, used_ai = enricher.enrich(event)
    location_label = (event.location_label or "").strip() or f"Camera {event.camera_id}"
    description = _select_report_description(event, enriched, used_ai)

    metadata = dict(event.metadata or {})
    metadata["ai_review"] = {
        "used_ai": used_ai,
        "severity": enriched.severity,
        "summary": enriched.summary,
        "validation_notes": enriched.validation_notes,
    }

    report = EnrichedAccidentReport(
        description=description.strip(),
        happening_now=enriched.happening_now,
        safe_to_continue=enriched.safe_to_continue,
        location_label=location_label,
        location_source="camera",
        latitude=event.latitude,
        longitude=event.longitude,
        priority=enriched.priority,
        status="submitted",
        camera_id=event.camera_id,
        confidence=event.confidence,
        detected_at=event.detected_at,
        metadata=metadata,
    )
    return report, used_ai


def _event_fingerprint(event: AccidentEvent) -> str:
    detected_at = event.detected_at.isoformat()
    confidence = f"{float(event.confidence):.3f}"
    return f"{event.camera_id}|{detected_at}|{confidence}"


def _is_duplicate_event(event: AccidentEvent) -> bool:
    fingerprint = _event_fingerprint(event)
    now = time.time()
    cutoff = now - _EVENT_DEDUPE_TTL_SECONDS

    with _dedupe_lock:
        stale_keys = [key for key, ts in _recent_event_fingerprints.items() if ts < cutoff]
        for key in stale_keys:
            _recent_event_fingerprints.pop(key, None)

        if fingerprint in _recent_event_fingerprints:
            return True

        _recent_event_fingerprints[fingerprint] = now
        return False


def _coarse_triage_from_confidence(confidence: float) -> tuple[str, str]:
    if confidence >= 0.92:
        return "Critical", "Critical"
    if confidence >= 0.8:
        return "High", "Major"
    if confidence >= 0.65:
        return "Medium", "Moderate"
    return "Low", "Minor"


def _select_report_description(
    event: AccidentEvent, enriched: AiEnrichmentResult, used_ai: bool
) -> str:
    ai_text = (enriched.cleaned_description or "").strip()
    has_image_evidence = len(event.evidence_images or []) > 0

    # Prefer AI narrative only when we have visual evidence and non-trivial output.
    if used_ai and has_image_evidence and len(ai_text) >= 50:
        return ai_text

    return _build_grounded_description(event)


def _build_grounded_description(event: AccidentEvent) -> str:
    parts = [
        f"Potential traffic incident detected by camera {event.camera_id}.",
        f"Detection confidence: {float(event.confidence):.2f}.",
    ]

    if event.description:
        parts.append(f"Source note: {event.description.strip()}")

    metadata = event.metadata or {}
    evidence_keys = ["detector_backend", "vehicles_seen", "max_iou", "motion_ratio"]
    evidence = []
    for key in evidence_keys:
        if key in metadata:
            evidence.append(f"{key}={metadata[key]}")
    if evidence:
        parts.append("Detector evidence: " + ", ".join(evidence) + ".")
    evidence_images = event.evidence_images or []
    if evidence_images:
        parts.append(f"Visual evidence frames attached: {len(evidence_images)}.")

    parts.append("Details are based on detector telemetry; visual scene specifics are unconfirmed.")
    return " ".join(parts)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "ai-admin-service", "status": "ok"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/ai-admin/ingest", response_model=PipelineIngestResponse)
def ingest_detection(
    event: AccidentEvent,
    x_ai_admin_key: str | None = Header(default=None),
) -> PipelineIngestResponse:
    _check_ingest_key(x_ai_admin_key)
    if _is_duplicate_event(event):
        priority, severity = _coarse_triage_from_confidence(float(event.confidence))
        logger.info(
            "Duplicate event suppressed camera_id=%s detected_at=%s confidence=%.3f",
            event.camera_id,
            event.detected_at.isoformat(),
            event.confidence,
        )
        return PipelineIngestResponse(
            message="Duplicate event suppressed.",
            server_status=200,
            priority=priority,
            severity=severity,
            used_ai=False,
        )

    report, used_ai = _build_report(event)
    logger.info(
        "AI admin processed camera_id=%s confidence=%.3f priority=%s used_ai=%s",
        event.camera_id,
        event.confidence,
        report.priority,
        used_ai,
    )

    response = publisher.publish_report(report)
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Main server rejected report ({response.status_code}): {response.text}",
        )

    ai_review = report.metadata.get("ai_review", {})
    return PipelineIngestResponse(
        message="Accident event validated and forwarded.",
        server_status=response.status_code,
        priority=report.priority,
        severity=ai_review.get("severity", "Moderate"),
        used_ai=used_ai,
    )


@app.post("/api/ai-admin/enrich-user-report", response_model=UserReportEnrichmentResult)
def enrich_user_report(
    draft: UserReportDraft,
    x_ai_admin_key: str | None = Header(default=None),
) -> UserReportEnrichmentResult:
    _check_ingest_key(x_ai_admin_key)
    return enricher.enrich_user_report(draft)
