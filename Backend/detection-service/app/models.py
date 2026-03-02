from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


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


class DetectionIngestResponse(BaseModel):
    message: str
    server_status: int
