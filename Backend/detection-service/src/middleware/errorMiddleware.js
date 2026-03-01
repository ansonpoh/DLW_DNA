import { HttpError } from "../utils/httpError.js";

export function notFoundHandler(req, res) {
  return res.status(404).json({ message: "Route not found." });
}

export function errorHandler(error, req, res, next) {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  return res.status(500).json({
    message: error?.message || "Internal server error.",
  });
}
