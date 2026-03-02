from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path

from faster_whisper import WhisperModel

from .config import settings


@dataclass(frozen=True)
class Transcript:
    text: str
    language: str
    language_probability: float
    duration_seconds: float


class WhisperTranscriber:
    def __init__(self) -> None:
        self._model_lock = threading.Lock()
        self._model: WhisperModel | None = None

    def _get_model(self) -> WhisperModel:
        if self._model is not None:
            return self._model

        with self._model_lock:
            if self._model is None:
                self._model = WhisperModel(
                    settings.whisper_model,
                    device=settings.whisper_device,
                    compute_type=settings.whisper_compute_type,
                    num_workers=settings.whisper_num_workers,
                )
        return self._model

    def transcribe_file(
        self,
        audio_path: str | Path,
        *,
        language: str | None = None,
        task: str = "transcribe",
    ) -> Transcript:
        model = self._get_model()
        segments, info = model.transcribe(
            str(audio_path),
            language=language or None,
            task=task,
            vad_filter=True,
        )

        parts: list[str] = []
        for segment in segments:
            text = (segment.text or "").strip()
            if text:
                parts.append(text)

        transcript_text = " ".join(parts).strip()
        if not transcript_text:
            raise RuntimeError("No speech could be transcribed from this audio file.")

        return Transcript(
            text=transcript_text,
            language=(info.language or "unknown").lower(),
            language_probability=float(info.language_probability or 0.0),
            duration_seconds=float(info.duration or 0.0),
        )


transcriber = WhisperTranscriber()
