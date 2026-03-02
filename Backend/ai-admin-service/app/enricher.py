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
    risky_keywords = (
        "fire",
        "smoke",
        "weapon",
        "knife",
        "gun",
        "fight",
        "violence",
        "crash",
        "accident",
        "explosion",
    )
    description_lower = cleaned_description.lower()
    inferred_unsafe = any(keyword in description_lower for keyword in risky_keywords)
    inferred_unsafe = inferred_unsafe or (
        draft.happening_now
        and draft.type.lower() in {"medical", "fire/smoke", "violence/fight", "accident/traffic"}
    )
    safe_to_continue = False if inferred_unsafe else bool(draft.safe_to_continue)
    location = (draft.location_label or "").strip()
    if location:
        summary = f"{draft.type} report submitted near {location}."
    else:
        summary = f"{draft.type} report submitted."
    reassurance_message = _build_reassurance_message(
        report_type=draft.type,
        safe_to_continue=safe_to_continue,
    )
    next_steps = _suggest_user_next_steps(
        report_type=draft.type,
        happening_now=bool(draft.happening_now),
        safe_to_continue=safe_to_continue,
    )

    return UserReportEnrichmentResult(
        cleaned_description=cleaned_description,
        summary=summary,
        priority=priority,  # type: ignore[arg-type]
        safe_to_continue=safe_to_continue,
        reassurance_message=reassurance_message,
        next_steps=next_steps,
        validation_notes="Fallback heuristic used because AI enrichment is unavailable.",
        used_ai=False,
    )


def _build_reassurance_message(*, report_type: str, safe_to_continue: bool) -> str:
    report_type_normalized = report_type.strip().lower()
    emergency_line = "999"

    if "medical" in report_type_normalized:
        lead = "Your report has been flagged for medical emergency follow-up."
        emergency_line = "995"
    elif "fire" in report_type_normalized or "smoke" in report_type_normalized:
        lead = "Your report has been flagged for fire and rescue follow-up."
        emergency_line = "995"
    elif (
        "violence" in report_type_normalized
        or "fight" in report_type_normalized
        or "weapon" in report_type_normalized
        or "harass" in report_type_normalized
        or "suspicious" in report_type_normalized
    ):
        lead = "Your report has been flagged for police response follow-up."
    elif "accident" in report_type_normalized or "traffic" in report_type_normalized:
        lead = "Your report has been flagged for traffic emergency follow-up."
    else:
        lead = "Your report has been flagged for relevant emergency follow-up."
        emergency_line = "999 or 995"

    if safe_to_continue:
        return (
            f"{lead} If risk increases or someone is in immediate danger, "
            f"call {emergency_line} now."
        )
    return f"{lead} Move to safety and call {emergency_line} now if there is immediate danger."


def _suggest_user_next_steps(
    *,
    report_type: str,
    happening_now: bool,
    safe_to_continue: bool,
) -> list[str]:
    report_type_normalized = report_type.strip().lower()

    if not safe_to_continue:
        return [
            "Move to a safer location immediately if you can do so safely.",
            "Call 999 for police threats or 995 for medical/fire emergencies.",
            "Avoid approaching the hazard and wait for responders.",
        ]

    if "accident" in report_type_normalized or "traffic" in report_type_normalized:
        return [
            "Keep clear of traffic and remain visible if you are near the road.",
            "Share the exact location and any lane blockage details with authorities.",
            "Document only from a safe distance and avoid obstructing responders.",
        ]

    if "medical" in report_type_normalized:
        return [
            "Call 995 and provide the exact location to medical services.",
            "Stay with the person only if the scene is safe and follow dispatcher instructions.",
            "Do not move an injured person unless there is immediate danger.",
        ]

    if "fire" in report_type_normalized or "smoke" in report_type_normalized:
        return [
            "Move upwind and away from smoke or flames.",
            "Call 995 and report what is burning and where.",
            "Do not attempt to re-enter affected areas until officials say it is safe.",
        ]

    if "violence" in report_type_normalized or "fight" in report_type_normalized:
        return [
            "Leave the area and seek shelter in a secure location.",
            "Call 999 and avoid direct confrontation.",
            "Observe from safety and share clear descriptions only if asked by authorities.",
        ]

    if happening_now:
        return [
            "Stay alert and keep a safe distance from the situation.",
            "Contact local authorities and share exact location details.",
            "If conditions worsen, move away and seek immediate help.",
        ]

    return [
        "Monitor the area and avoid unnecessary exposure to risk.",
        "Share any useful updates or evidence with authorities if requested.",
        "Seek official guidance if similar incidents continue.",
    ]


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
            "Output only valid JSON with keys: cleaned_description, summary, priority, safe_to_continue, reassurance_message, next_steps, validation_notes. "
            "cleaned_description must be 1-3 sentences. "
            "summary should be concise and factual. "
            "safe_to_continue must be false if the reporter likely faces immediate risk. "
            "reassurance_message must be one supportive sentence that references the most relevant emergency service type "
            "(medical, fire/rescue, police, or traffic response) and advises calling 999 for police threats "
            "or 995 for medical/fire emergencies when immediate danger exists. "
            "Do not claim confirmed dispatch, arrival, or direct contact completion. "
            "next_steps must be a list of 2-4 concise, practical actions for the reporter to take now. "
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
                    "safe_to_continue": parsed.get("safe_to_continue"),
                    "reassurance_message": parsed.get("reassurance_message"),
                    "next_steps": parsed.get("next_steps"),
                    "validation_notes": parsed.get("validation_notes"),
                    "used_ai": True,
                }
            )
            return enriched
        except Exception:
            return _baseline_user_report_enrichment(draft)


enricher = ReportEnricher()
