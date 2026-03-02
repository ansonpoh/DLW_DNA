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
- `POST /api/detection/analyze-media` with header `x-detection-key` (multipart file upload)
- `POST /api/detection/start-camera` with header `x-detection-admin-key`
- `GET /api/detection/status` with header `x-detection-admin-key`

`/api/detection/ingest` forwards accident payloads to `REPORT_PIPELINE_INGEST_URL` (AI admin service).

`/api/detection/analyze-media` accepts an uploaded image or video (`media`) and infers an incident type using the detector model + heuristics. If confidence is above threshold, it can forward a compatible event payload to the report pipeline.

Example form fields for `/api/detection/analyze-media`:
- `media` (required): image/video file
- `source_id` (optional): defaults to `CAMERA_ID`
- `location_label` (optional)
- `latitude` / `longitude` (optional)
- `forward_event` (optional, default `true`)

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
EVIDENCE_FRAME_COUNT=2
EVIDENCE_JPEG_QUALITY=75
EVIDENCE_IMAGE_MAX_WIDTH=960
VIDEO_SAMPLE_EVERY_N_FRAMES=5
VIDEO_MAX_FRAMES_ANALYZED=48
INCIDENT_CONFIDENCE_THRESHOLD=0.55
```

If YOLO is unavailable, the service falls back to the legacy motion-area detector.

## Optional: Email Notification on Accident (Testing)

When enabled, each forwarded accident event also sends an email notification.

Add these values to `.env`:

```env
EMAIL_NOTIFICATIONS_ENABLED=true
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USE_TLS=true
EMAIL_SMTP_USERNAME=your_email@gmail.com
EMAIL_SMTP_PASSWORD=your_app_password
EMAIL_FROM=your_email@gmail.com
EMAIL_TO=your_email@gmail.com
EMAIL_SUBJECT_PREFIX=[DLW DNA]
```

Notes:
- `EMAIL_TO` supports multiple recipients as comma-separated emails.
- If SMTP auth is not required by your provider, leave `EMAIL_SMTP_USERNAME` and `EMAIL_SMTP_PASSWORD` empty.
