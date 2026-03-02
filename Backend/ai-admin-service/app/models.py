from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

Priority = Literal["Low", "Medium", "High", "Critical"]
Severity = Literal["Minor", "Moderate", "Major", "Critical"]


class AccidentEvent(BaseModel):
    camera_id: str = Field(min_length=1, max_length=120)
    confidence: float = Field(ge=0.0, le=1.0)
    detected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    description: str | None = Field(default=None, max_length=1000)
    location_label: str | None = Field(default=None, max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    metadata: dict[str, Any] = Field(default_factory=dict)
    evidence_images: list[str] = Field(default_factory=list, max_length=3)


class EnrichedAccidentReport(BaseModel):
    type: str = "Accident"
    description: str = Field(min_length=1, max_length=1500)
    happening_now: bool = True
    safe_to_continue: bool = False
    location_label: str = Field(min_length=1, max_length=200)
    location_source: str = "camera"
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    priority: Priority
    status: str = "submitted"
    camera_id: str = Field(min_length=1, max_length=120)
    confidence: float = Field(ge=0.0, le=1.0)
    detected_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class AiEnrichmentResult(BaseModel):
    cleaned_description: str = Field(min_length=1, max_length=1200)
    summary: str = Field(min_length=1, max_length=280)
    severity: Severity
    priority: Priority
    happening_now: bool
    safe_to_continue: bool
    validation_notes: str = Field(min_length=1, max_length=500)


class UserReportDraft(BaseModel):
    type: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1500)
    happening_now: bool = True
    safe_to_continue: bool = True
    location_label: str | None = Field(default=None, max_length=200)
    location_source: str | None = Field(default=None, max_length=60)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    priority: Priority | None = None


class UserReportEnrichmentResult(BaseModel):
    cleaned_description: str = Field(min_length=1, max_length=1200)
    summary: str = Field(min_length=1, max_length=280)
    priority: Priority
    safe_to_continue: bool
    reassurance_message: str = Field(min_length=1, max_length=320)
    next_steps: list[str] = Field(min_length=1, max_length=5)
    validation_notes: str = Field(min_length=1, max_length=500)
    used_ai: bool


class PipelineIngestResponse(BaseModel):
    message: str
    server_status: int
    priority: Priority
    severity: Severity
    used_ai: bool
