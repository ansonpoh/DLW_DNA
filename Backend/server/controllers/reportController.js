import { createReport, listOwnReports } from "../services/reportService.js";

export async function postReport(req, res, next) {
  try {
    const result = await createReport(req.authUser, req.body || {});
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
