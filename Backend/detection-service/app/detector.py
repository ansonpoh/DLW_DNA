from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Callable

import cv2

from .config import settings
from .models import AccidentEvent


def _parse_camera_source(raw: str) -> int | str:
    if raw.isdigit():
        return int(raw)
    return raw


def run_camera_detection_loop(on_detected: Callable[[AccidentEvent], None]) -> None:
    source = _parse_camera_source(settings.camera_source)
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"Unable to open camera source: {settings.camera_source}")

    bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=200, varThreshold=30)
    last_emitted = 0.0

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                time.sleep(0.1)
                continue

            mask = bg_subtractor.apply(frame)
            _, thresh = cv2.threshold(mask, 250, 255, cv2.THRESH_BINARY)
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            max_area = 0.0
            for contour in contours:
                area = cv2.contourArea(contour)
                if area > max_area:
                    max_area = area

            confidence = min(max_area / float(max(settings.motion_area_threshold, 1)), 1.0)
            now = time.time()

            if (
                confidence >= settings.accident_confidence_threshold
                and now - last_emitted >= settings.detection_cooldown_seconds
            ):
                event = AccidentEvent(
                    camera_id=settings.camera_id,
                    confidence=confidence,
                    detected_at=datetime.now(timezone.utc),
                    metadata={
                        "max_motion_area": round(max_area, 2),
                        "motion_area_threshold": settings.motion_area_threshold,
                    },
                )
                on_detected(event)
                last_emitted = now
    finally:
        cap.release()
