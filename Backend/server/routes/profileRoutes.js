import { Router } from "express";
import { getProfile, patchProfile } from "../controllers/profileController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.use(requireAuth);
router.get("/", getProfile);
router.patch("/", patchProfile);

export default router;
