import {
  createDetectionReport,
  createReport,
  listAllReportsForAdmin,
  listOwnReports,
  updateReportForAdmin,
} from "../services/reportService.js";

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
