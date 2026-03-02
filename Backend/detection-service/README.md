# DLW DNA Detection Service (Python)

## Setup

```bash
cd Backend/detection-service
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
copy .env.example .env
```

## Run

```bash
uvicorn main:app --host 0.0.0.0 --port 3011 --reload --env-file .env
```

## API

- `GET /health`
- `POST /api/detection/ingest` with header `x-detection-key`
- `POST /api/detection/start-camera` with header `x-detection-admin-key`
- `GET /api/detection/status` with header `x-detection-admin-key`

`/api/detection/ingest` forwards accident payloads to `SERVER_REPORT_INGEST_URL`.

## Camera Detection (MVP)

The camera loop now supports a YOLO-based heuristic detector:

- detector: `ultralytics` YOLO (`yolov8n.pt` default)
- target classes: vehicles (`2,3,5,7` in COCO: car, motorcycle, bus, truck)
- confidence score: weighted heuristic from box overlap (IoU), proximity, and frame motion

### Suggested `.env` values

```env
DETECTOR_BACKEND=yolo
YOLO_MODEL_PATH=yolov8n.pt
YOLO_CONF_THRESHOLD=0.30
YOLO_DEVICE=cpu
YOLO_VEHICLE_CLASS_IDS=2,3,5,7
ACCIDENT_CONFIDENCE_THRESHOLD=0.60
DETECTION_COOLDOWN_SECONDS=20
```

If YOLO is unavailable, the service falls back to the legacy motion-area detector.
