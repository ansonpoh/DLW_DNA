from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from .config import settings
from .models import (
    AccidentEvent,
    AiEnrichmentResult,
    UserReportDraft,
    UserReportEnrichmentResult,
)


def _baseline_enrichment(event: AccidentEvent) -> AiEnrichmentResult:
    confidence = float(event.confidence)
    severity = "Minor"
    priority = "Low"

    if confidence >= 0.92:
        severity = "Critical"
        priority = "Critical"
    elif confidence >= 0.8:
        severity = "Major"
        priority = "High"
    elif confidence >= 0.65:
        severity = "Moderate"
        priority = "Medium"

    raw_description = (event.description or "").strip()
    cleaned_description = raw_description or (
        f"Potential traffic accident detected by camera {event.camera_id}."
    )

    return AiEnrichmentResult(
        cleaned_description=cleaned_description,
        summary=f"Camera {event.camera_id} detected a possible accident (confidence {confidence:.2f}).",
        severity=severity,  # type: ignore[arg-type]
        priority=priority,  # type: ignore[arg-type]
        happening_now=True,
        safe_to_continue=False if confidence >= 0.65 else True,
        validation_notes="Fallback heuristic used because AI enrichment is unavailable.",
    )


def _baseline_user_report_enrichment(draft: UserReportDraft) -> UserReportEnrichmentResult:
    cleaned_description = draft.description.strip()
    priority = draft.priority or ("High" if draft.happening_now else "Medium")
    location = (draft.location_label or "").strip()
    if location:
        summary = f"{draft.type} report submitted near {location}."
    else:
        summary = f"{draft.type} report submitted."

    return UserReportEnrichmentResult(
        cleaned_description=cleaned_description,
        summary=summary,
        priority=priority,  # type: ignore[arg-type]
        validation_notes="Fallback heuristic used because AI enrichment is unavailable.",
        used_ai=False,
    )


class ReportEnricher:
    def __init__(self) -> None:
        self._client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

    def enrich(self, event: AccidentEvent) -> tuple[AiEnrichmentResult, bool]:
        if not self._client:
            return _baseline_enrichment(event), False

        system_prompt = (
            "You are an incident triage assistant for traffic safety reports. "
            "Validate whether the detection input is coherent. "
            "Do not invent visual details, injuries, vehicle types, weather, lane count, "
            "or causes that are not explicitly present in the input payload. "
            "If evidence is limited, state uncertainty in validation_notes. "
            "When evidence images are provided, produce a specific scene description using only visible facts: "
            "vehicle count (if visible), relative positions, apparent impact cues, stopped traffic cues, "
            "and obstruction cues. Avoid generic templates and vary wording based on observed evidence. "
            "If a detail is uncertain, explicitly mark it as 'appears' or 'possibly'. "
            "Assign severity and priority conservatively based on risk to life, road blockage potential, and confidence. "
            "Output only valid JSON with keys: cleaned_description, summary, severity, priority, "
            "happening_now, safe_to_continue, validation_notes. "
            "cleaned_description must be 2-4 sentences and contain concrete observations from the provided evidence. "
            "severity must be one of Minor, Moderate, Major, Critical. "
            "priority must be one of Low, Medium, High, Critical."
        )

        user_payload: dict[str, Any] = {
            "camera_id": event.camera_id,
            "confidence": event.confidence,
            "detected_at": event.detected_at.isoformat(),
            "description": event.description,
            "location_label": event.location_label,
            "latitude": event.latitude,
            "longitude": event.longitude,
            "metadata": event.metadata,
            "evidence_images_count": len(event.evidence_images or []),
        }

        try:
            user_content: list[dict[str, Any]] = [
                {
                    "type": "input_text",
                    "text": (
                        "Enrich and validate this accident detection report:\n"
                        + json.dumps(user_payload, ensure_ascii=True)
                    ),
                }
            ]
            for encoded_image in (event.evidence_images or [])[:3]:
                user_content.append(
                    {
                        "type": "input_image",
                        "image_url": f"data:image/jpeg;base64,{encoded_image}",
                    }
                )

            response = self._client.responses.create(
                model=settings.openai_model,
                temperature=0,
                max_output_tokens=300,
                input=[
                    {
                        "role": "system",
                        "content": [{"type": "input_text", "text": system_prompt}],
                    },
                    {
                        "role": "user",
                        "content": user_content,
                    },
                ],
                timeout=settings.openai_timeout_seconds,
            )
            raw_output = response.output_text.strip()
            parsed = json.loads(raw_output)
            enriched = AiEnrichmentResult.model_validate(parsed)
            return enriched, True
        except Exception:
            return _baseline_enrichment(event), False

    def enrich_user_report(self, draft: UserReportDraft) -> UserReportEnrichmentResult:
        if not self._client:
            return _baseline_user_report_enrichment(draft)

        system_prompt = (
            "You are an incident triage assistant for citizen-submitted safety reports. "
            "Clean up text for clarity while preserving meaning. "
            "Do not invent new facts, injuries, causes, suspect identities, or outcomes. "
            "Assign priority conservatively based on urgency in the provided report only. "
            "Output only valid JSON with keys: cleaned_description, summary, priority, validation_notes. "
            "cleaned_description must be 1-3 sentences. "
            "summary should be concise and factual. "
            "priority must be one of Low, Medium, High, Critical."
        )

        user_payload: dict[str, Any] = {
            "type": draft.type,
            "description": draft.description,
            "happening_now": draft.happening_now,
            "safe_to_continue": draft.safe_to_continue,
            "location_label": draft.location_label,
            "location_source": draft.location_source,
            "latitude": draft.latitude,
            "longitude": draft.longitude,
            "priority": draft.priority,
        }

        try:
            response = self._client.responses.create(
                model=settings.openai_model,
                temperature=0,
                max_output_tokens=220,
                input=[
                    {
                        "role": "system",
                        "content": [{"type": "input_text", "text": system_prompt}],
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": (
                                    "Enrich and validate this user safety report:\n"
                                    + json.dumps(user_payload, ensure_ascii=True)
                                ),
                            }
                        ],
                    },
                ],
                timeout=settings.openai_timeout_seconds,
            )
            raw_output = response.output_text.strip()
            parsed = json.loads(raw_output)
            enriched = UserReportEnrichmentResult.model_validate(
                {
                    "cleaned_description": parsed.get("cleaned_description"),
                    "summary": parsed.get("summary"),
                    "priority": parsed.get("priority"),
                    "validation_notes": parsed.get("validation_notes"),
                    "used_ai": True,
                }
            )
            return enriched
        except Exception:
            return _baseline_user_report_enrichment(draft)


enricher = ReportEnricher()
