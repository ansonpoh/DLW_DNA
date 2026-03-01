import { Router } from "express";
import {
  getOwnReports,
  postDetectionReport,
  postReport,
} from "../controllers/reportController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireDetectionIngestKey } from "../middleware/detectionKeyMiddleware.js";

const router = Router();

router.post("/detection", requireDetectionIngestKey, postDetectionReport);

router.use(requireAuth);
router.get("/mine", getOwnReports);
router.post("/", postReport);

export default router;
