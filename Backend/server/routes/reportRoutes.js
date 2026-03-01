import { Router } from "express";
import { getOwnReports, postReport } from "../controllers/reportController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.use(requireAuth);
router.get("/mine", getOwnReports);
router.post("/", postReport);

export default router;
