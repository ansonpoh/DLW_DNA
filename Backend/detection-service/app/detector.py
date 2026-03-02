from __future__ import annotations

import base64
import logging
import math
import os
import tempfile
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

import cv2
import numpy as np

from .config import settings
from .models import AccidentEvent

try:
    from ultralytics import YOLO
except ImportError:  # pragma: no cover - runtime fallback for missing optional dep
    YOLO = None


VEHICLE_CLASS_DEFAULT = {2, 3, 5, 7}
logger = logging.getLogger(__name__)

_status_lock = threading.Lock()
_runtime_status: dict[str, object] = {
    "running": False,
    "started_at": None,
    "backend": None,
    "camera_source": None,
    "camera_id": settings.camera_id,
    "frames_processed": 0,
    "events_emitted": 0,
    "last_frame_at": None,
    "last_event_at": None,
    "last_event_confidence": None,
    "last_error": None,
}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _update_status(**changes) -> None:
    with _status_lock:
        _runtime_status.update(changes)


def get_detector_status() -> dict[str, object]:
    with _status_lock:
        return dict(_runtime_status)


def _parse_camera_source(raw: str) -> int | str:
    if raw.isdigit():
        return int(raw)
    return raw


def _parse_class_ids(raw: str) -> list[int]:
    values = []
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        if token.isdigit():
            values.append(int(token))
    return values or sorted(VEHICLE_CLASS_DEFAULT)


def _to_xyxy(box) -> tuple[float, float, float, float]:
    coords = box.xyxy[0].tolist()
    return float(coords[0]), float(coords[1]), float(coords[2]), float(coords[3])


def _bbox_area(box_xyxy: tuple[float, float, float, float]) -> float:
    x1, y1, x2, y2 = box_xyxy
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)


def _bbox_center(box_xyxy: tuple[float, float, float, float]) -> tuple[float, float]:
    x1, y1, x2, y2 = box_xyxy
    return (x1 + x2) / 2.0, (y1 + y2) / 2.0


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    inter_w = max(0.0, ix2 - ix1)
    inter_h = max(0.0, iy2 - iy1)
    inter = inter_w * inter_h
    if inter <= 0:
        return 0.0
    union = _bbox_area(a) + _bbox_area(b) - inter
    if union <= 0:
        return 0.0
    return inter / union


def _motion_ratio(prev_gray, gray) -> float:
    if prev_gray is None:
        return 0.0
    diff = cv2.absdiff(gray, prev_gray)
    _, thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
    changed_pixels = cv2.countNonZero(thresh)
    total_pixels = max(gray.shape[0] * gray.shape[1], 1)
    return float(changed_pixels) / float(total_pixels)


def _heuristic_confidence(
    boxes_xyxy: list[tuple[float, float, float, float]],
    frame_shape: tuple[int, ...],
    motion_ratio: float,
) -> tuple[float, dict[str, float | int]]:
    if len(frame_shape) < 2:
        return 0.0, {"vehicles_seen": len(boxes_xyxy), "motion_ratio": round(motion_ratio, 4)}

    frame_h, frame_w = frame_shape[:2]
    diagonal = math.hypot(frame_w, frame_h)

    max_iou = 0.0
    min_center_distance = float("inf")

    for idx in range(len(boxes_xyxy)):
        for jdx in range(idx + 1, len(boxes_xyxy)):
            a = boxes_xyxy[idx]
            b = boxes_xyxy[jdx]
            max_iou = max(max_iou, _iou(a, b))
            acx, acy = _bbox_center(a)
            bcx, bcy = _bbox_center(b)
            distance = math.hypot(acx - bcx, acy - bcy)
            min_center_distance = min(min_center_distance, distance)

    if min_center_distance == float("inf"):
        min_center_distance = diagonal

    closeness = 1.0 - min(min_center_distance / max(diagonal, 1.0), 1.0)
    motion_score = min(motion_ratio * 6.0, 1.0)

    # Weighted heuristic for hackathon MVP:
    # overlap + proximity + sudden motion change.
    base_confidence = (0.55 * max_iou) + (0.30 * closeness) + (0.15 * motion_score)

    # Require multiple vehicles for full confidence. One vehicle can still trigger,
    # but with a much lower cap to reduce false positives.
    if len(boxes_xyxy) < 2:
        confidence = min(base_confidence, 0.45)
    else:
        confidence = base_confidence

    confidence = max(0.0, min(confidence, 1.0))
    metadata = {
        "vehicles_seen": len(boxes_xyxy),
        "max_iou": round(max_iou, 4),
        "min_center_distance_px": round(min_center_distance, 2),
        "motion_ratio": round(motion_ratio, 4),
    }
    return confidence, metadata


def _build_yolo_detector():
    if YOLO is None:
        return None
    if settings.detector_backend != "yolo":
        return None
    return YOLO(settings.yolo_model_path)


def _run_motion_fallback(frame, bg_subtractor) -> tuple[float, dict[str, float | int]]:
    mask = bg_subtractor.apply(frame)
    _, thresh = cv2.threshold(mask, 250, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    max_area = 0.0
    for contour in contours:
        area = cv2.contourArea(contour)
        if area > max_area:
            max_area = area

    confidence = min(max_area / float(max(settings.motion_area_threshold, 1)), 1.0)
    metadata = {
        "detector_backend": "motion-fallback",
        "max_motion_area": round(max_area, 2),
        "motion_area_threshold": settings.motion_area_threshold,
    }
    return confidence, metadata


def _encode_jpeg_base64(frame) -> str | None:
    width = int(frame.shape[1]) if len(frame.shape) >= 2 else 0
    max_width = max(160, int(settings.evidence_image_max_width))
    quality = min(95, max(40, int(settings.evidence_jpeg_quality)))

    if width > max_width:
        ratio = max_width / float(width)
        height = int(frame.shape[0] * ratio)
        frame = cv2.resize(frame, (max_width, max(1, height)), interpolation=cv2.INTER_AREA)

    ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        return None
    return base64.b64encode(encoded.tobytes()).decode("ascii")


def _build_evidence_images(prev_frame, current_frame) -> list[str]:
    target_count = min(3, max(0, int(settings.evidence_frame_count)))
    if target_count <= 0:
        return []

    candidates = []
    if prev_frame is not None:
        candidates.append(prev_frame)
    candidates.append(current_frame)

    encoded_images = []
    for frame in candidates:
        if len(encoded_images) >= target_count:
            break
        encoded = _encode_jpeg_base64(frame)
        if encoded:
            encoded_images.append(encoded)
    return encoded_images


@dataclass(frozen=True)
class IncidentAnalysisResult:
    incident_type: str
    confidence: float
    model_backend: str
    frames_analyzed: int
    metadata: dict[str, Any]
    evidence_images: list[str]


def _analyze_single_frame(frame, yolo_model, prev_gray) -> tuple[float, int, int, float, dict[str, Any]]:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    motion_ratio = _motion_ratio(prev_gray, gray)
    if yolo_model is None:
        score, fallback_meta = _run_motion_fallback(frame, cv2.createBackgroundSubtractorMOG2(history=80))
        return score, 0, 0, motion_ratio, fallback_meta

    yolo_class_ids = _parse_class_ids(settings.yolo_vehicle_class_ids)
    result = yolo_model.predict(
        source=frame,
        conf=settings.yolo_conf_threshold,
        device=settings.yolo_device,
        verbose=False,
    )[0]
    boxes = result.boxes or []
    vehicle_boxes_xyxy: list[tuple[float, float, float, float]] = []
    person_count = 0
    class_counts: dict[str, int] = {}

    for box in boxes:
        class_id = int(box.cls[0].item())
        class_name = result.names.get(class_id, str(class_id))
        class_counts[class_name] = int(class_counts.get(class_name, 0)) + 1
        if class_id == settings.yolo_person_class_id:
            person_count += 1
        if class_id in yolo_class_ids:
            vehicle_boxes_xyxy.append(_to_xyxy(box))

    collision_score, collision_meta = _heuristic_confidence(
        boxes_xyxy=vehicle_boxes_xyxy,
        frame_shape=frame.shape,
        motion_ratio=motion_ratio,
    )
    metadata = {
        "detector_backend": "yolo-incident-heuristic",
        "vehicle_count": len(vehicle_boxes_xyxy),
        "person_count": person_count,
        "class_counts": class_counts,
        **collision_meta,
    }
    return collision_score, len(vehicle_boxes_xyxy), person_count, motion_ratio, metadata


def _classify_incident(
    *,
    peak_collision_score: float,
    peak_vehicle_count: int,
    peak_person_count: int,
    avg_motion_ratio: float,
) -> tuple[str, float]:
    if peak_collision_score >= settings.accident_confidence_threshold and peak_vehicle_count >= 2:
        return "traffic_accident", peak_collision_score
    if peak_vehicle_count >= 1 and peak_person_count >= 1 and peak_collision_score >= 0.40:
        return "pedestrian_vehicle_conflict", min(1.0, peak_collision_score + 0.10)
    if peak_person_count >= 4 and peak_vehicle_count == 0 and avg_motion_ratio >= 0.03:
        return "crowd_disturbance", min(1.0, 0.55 + avg_motion_ratio)
    if peak_vehicle_count >= 1 and peak_collision_score < 0.30:
        return "vehicle_stoppage_or_breakdown", min(0.85, 0.45 + (avg_motion_ratio * 3.0))
    return "no_clear_incident", max(0.20, peak_collision_score)


def _iter_video_frames(path: str):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError("Unable to open uploaded video for analysis.")
    try:
        frame_index = 0
        sampled = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            should_sample = (frame_index % max(1, settings.video_sample_every_n_frames)) == 0
            frame_index += 1
            if not should_sample:
                continue
            sampled += 1
            if sampled > max(1, settings.video_max_frames_analyzed):
                break
            yield frame
    finally:
        cap.release()


def analyze_media_bytes(filename: str, payload: bytes) -> IncidentAnalysisResult:
    yolo_model = _build_yolo_detector()
    backend = "yolo-incident-heuristic" if yolo_model is not None else "motion-fallback"
    suffix = os.path.splitext(filename.lower())[1]
    is_video = suffix in {".mp4", ".mov", ".avi", ".mkv", ".webm", ".mpeg", ".mpg"}

    frames: list[Any] = []
    if is_video:
        with tempfile.NamedTemporaryFile(suffix=suffix or ".mp4", delete=False) as handle:
            handle.write(payload)
            temp_path = handle.name
        try:
            for frame in _iter_video_frames(temp_path):
                frames.append(frame)
        finally:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
    else:
        raw = np.frombuffer(payload, dtype=np.uint8)
        frame = cv2.imdecode(raw, cv2.IMREAD_COLOR)
        if frame is None:
            raise RuntimeError("Unable to decode uploaded image.")
        frames.append(frame)

    if not frames:
        raise RuntimeError("No analyzable frames found in uploaded media.")

    peak_collision_score = 0.0
    peak_vehicle_count = 0
    peak_person_count = 0
    motion_samples: list[float] = []
    aggregate_class_counts: dict[str, int] = {}
    frame_telemetry: list[dict[str, Any]] = []
    prev_gray = None

    for frame in frames:
        score, vehicle_count, person_count, motion_ratio, telemetry = _analyze_single_frame(
            frame=frame,
            yolo_model=yolo_model,
            prev_gray=prev_gray,
        )
        prev_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        peak_collision_score = max(peak_collision_score, score)
        peak_vehicle_count = max(peak_vehicle_count, vehicle_count)
        peak_person_count = max(peak_person_count, person_count)
        motion_samples.append(motion_ratio)

        class_counts = telemetry.get("class_counts", {})
        if isinstance(class_counts, dict):
            for class_name, count in class_counts.items():
                aggregate_class_counts[str(class_name)] = int(
                    aggregate_class_counts.get(str(class_name), 0)
                ) + int(count)

        frame_telemetry.append(
            {
                "vehicle_count": vehicle_count,
                "person_count": person_count,
                "collision_score": round(score, 4),
                "motion_ratio": round(motion_ratio, 4),
            }
        )

    avg_motion_ratio = sum(motion_samples) / float(max(len(motion_samples), 1))
    incident_type, incident_confidence = _classify_incident(
        peak_collision_score=peak_collision_score,
        peak_vehicle_count=peak_vehicle_count,
        peak_person_count=peak_person_count,
        avg_motion_ratio=avg_motion_ratio,
    )

    metadata: dict[str, Any] = {
        "detector_backend": backend,
        "model": settings.yolo_model_path if yolo_model is not None else "motion-fallback",
        "source_media_type": "video" if is_video else "image",
        "frames_analyzed": len(frames),
        "video_sample_every_n_frames": settings.video_sample_every_n_frames if is_video else None,
        "peak_collision_score": round(peak_collision_score, 4),
        "peak_vehicle_count": peak_vehicle_count,
        "peak_person_count": peak_person_count,
        "avg_motion_ratio": round(avg_motion_ratio, 4),
        "class_counts": aggregate_class_counts,
        "incident_type": incident_type,
        "frame_telemetry": frame_telemetry[:8],
        "limitation_note": (
            "This endpoint infers incident type from YOLO object detections and motion heuristics."
        ),
    }

    evidence_images = _build_evidence_images(
        frames[0] if len(frames) > 1 else None,
        frames[-1],
    )
    metadata["evidence_images_count"] = len(evidence_images)

    return IncidentAnalysisResult(
        incident_type=incident_type,
        confidence=max(0.0, min(incident_confidence, 1.0)),
        model_backend=backend,
        frames_analyzed=len(frames),
        metadata=metadata,
        evidence_images=evidence_images,
    )


def run_camera_detection_loop(on_detected: Callable[[AccidentEvent], None]) -> None:
    source = _parse_camera_source(settings.camera_source)
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        _update_status(
            running=False,
            last_error=f"Unable to open camera source: {settings.camera_source}",
        )
        raise RuntimeError(f"Unable to open camera source: {settings.camera_source}")

    bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=200, varThreshold=30)
    yolo_model = _build_yolo_detector()
    yolo_class_ids = _parse_class_ids(settings.yolo_vehicle_class_ids)
    active_backend = "yolo-heuristic" if yolo_model is not None else "motion-fallback"
    last_emitted = 0.0
    prev_gray = None
    prev_frame = None
    _update_status(
        running=True,
        started_at=_utc_now_iso(),
        backend=active_backend,
        camera_source=str(settings.camera_source),
        camera_id=settings.camera_id,
        frames_processed=0,
        events_emitted=0,
        last_frame_at=None,
        last_event_at=None,
        last_event_confidence=None,
        last_error=None,
    )
    logger.info("Camera loop started with backend=%s source=%s", active_backend, settings.camera_source)

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                time.sleep(0.1)
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            motion_ratio = _motion_ratio(prev_gray, gray)
            prev_gray = gray
            with _status_lock:
                _runtime_status["frames_processed"] = int(_runtime_status["frames_processed"]) + 1
                _runtime_status["last_frame_at"] = _utc_now_iso()

            metadata: dict[str, float | int | str]
            if yolo_model is not None:
                result = yolo_model.predict(
                    source=frame,
                    conf=settings.yolo_conf_threshold,
                    classes=yolo_class_ids,
                    device=settings.yolo_device,
                    verbose=False,
                )[0]
                boxes = result.boxes or []
                boxes_xyxy = [_to_xyxy(box) for box in boxes]
                confidence, score_meta = _heuristic_confidence(
                    boxes_xyxy=boxes_xyxy,
                    frame_shape=frame.shape,
                    motion_ratio=motion_ratio,
                )
                metadata = {
                    "detector_backend": "yolo-heuristic",
                    "model": settings.yolo_model_path,
                    "yolo_conf_threshold": settings.yolo_conf_threshold,
                    "class_ids": ",".join(str(v) for v in yolo_class_ids),
                    **score_meta,
                }
            else:
                confidence, metadata = _run_motion_fallback(frame, bg_subtractor)

            now = time.time()

            if (
                confidence >= settings.accident_confidence_threshold
                and now - last_emitted >= settings.detection_cooldown_seconds
            ):
                evidence_images = _build_evidence_images(prev_frame, frame)
                metadata["evidence_images_count"] = len(evidence_images)
                event = AccidentEvent(
                    camera_id=settings.camera_id,
                    confidence=confidence,
                    detected_at=datetime.now(timezone.utc),
                    metadata=metadata,
                    evidence_images=evidence_images,
                )
                on_detected(event)
                with _status_lock:
                    _runtime_status["events_emitted"] = int(_runtime_status["events_emitted"]) + 1
                    _runtime_status["last_event_at"] = _utc_now_iso()
                    _runtime_status["last_event_confidence"] = round(confidence, 4)
                last_emitted = now
                logger.info(
                    "Accident event emitted camera_id=%s confidence=%.3f backend=%s",
                    settings.camera_id,
                    confidence,
                    active_backend,
                )
            prev_frame = frame.copy()
    except Exception as error:
        _update_status(last_error=str(error))
        logger.exception("Camera loop crashed: %s", error)
        raise
    finally:
        _update_status(running=False)
        cap.release()
        logger.info("Camera loop stopped.")
