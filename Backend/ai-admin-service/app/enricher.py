from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from .config import settings
from .models import AccidentEvent, AiEnrichmentResult


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


enricher = ReportEnricher()
