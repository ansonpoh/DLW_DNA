import { Router } from "express";
import multer from "multer";
import {
  getOwnReports,
  postAudioReport,
  postDetectionReport,
  postReport,
} from "../controllers/reportController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireDetectionIngestKey } from "../middleware/detectionKeyMiddleware.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.post("/detection", requireDetectionIngestKey, postDetectionReport);

router.use(requireAuth);
router.get("/mine", getOwnReports);
router.post("/", postReport);
router.post("/audio", upload.single("audio"), postAudioReport);

export default router;
