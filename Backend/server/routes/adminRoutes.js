import { Router } from "express";
import {
  getAdminReports,
  patchAdminReport,
} from "../controllers/reportController.js";
import { requireAdminAuth } from "../middleware/adminAuthMiddleware.js";

const router = Router();

router.use(requireAdminAuth);
router.get("/reports", getAdminReports);
router.patch("/reports/:reportId", patchAdminReport);

export default router;
