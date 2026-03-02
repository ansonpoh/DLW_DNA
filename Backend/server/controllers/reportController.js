import {
  createDetectionReport,
  createReport,
  listAllReportsForAdmin,
  listOwnReports,
  updateReportForAdmin,
} from "../services/reportService.js";
import { HttpError } from "../utils/httpError.js";
import { transcribeAudioViaSttService } from "../services/sttService.js";

function parseBooleanInput(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

export async function postReport(req, res, next) {
  try {
    const result = await createReport(req.authUser, req.body || {});
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function postDetectionReport(req, res, next) {
  try {
    const result = await createDetectionReport(req.body || {});
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function postAudioReport(req, res, next) {
  try {
    const file = req.file;
    if (!file) {
      throw new HttpError(400, "Audio file is required (field name: audio).");
    }

    const body = req.body || {};
    const transcription = await transcribeAudioViaSttService(file, body);
    const reportPayload = {
      type: String(body.type || "Audio Incident Report").trim(),
      description: transcription.text,
      happening_now: parseBooleanInput(body.happening_now, true),
      safe_to_continue: parseBooleanInput(body.safe_to_continue, true),
      location_label: String(body.location_label || "").trim(),
      location_source: "audio",
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      priority: String(body.priority || "Medium").trim(),
      status: "submitted",
    };

    const created = await createReport(req.authUser, reportPayload);
    return res.status(201).json({
      ...created,
      transcription,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getOwnReports(req, res, next) {
  try {
    const result = await listOwnReports(req.authUser);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getAdminReports(req, res, next) {
  try {
    const result = await listAllReportsForAdmin();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function patchAdminReport(req, res, next) {
  try {
    const result = await updateReportForAdmin(req.params.reportId, req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
