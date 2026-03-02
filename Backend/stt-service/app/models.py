from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Priority = Literal["Low", "Medium", "High", "Critical"]
TranscriptionTask = Literal["transcribe", "translate"]


class TranscriptionResult(BaseModel):
    text: str = Field(min_length=1, max_length=6000)
    language: str = Field(min_length=2, max_length=16)
    language_probability: float = Field(ge=0.0, le=1.0)
    duration_seconds: float = Field(ge=0.0)
    model: str = Field(min_length=1, max_length=80)


class ReportForwardRequest(BaseModel):
    report_type: str = Field(default="Audio Incident Report", min_length=1, max_length=120)
    location_label: str | None = Field(default=None, max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    happening_now: bool = True
    safe_to_continue: bool = True
    priority: Priority = "Medium"
    source_id: str | None = Field(default=None, max_length=120)


class TranscriptionResponse(BaseModel):
    message: str
    transcription: TranscriptionResult
    report_forwarded: bool
    server_status: int | None = None
