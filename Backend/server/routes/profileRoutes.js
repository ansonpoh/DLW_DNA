import { Router } from "express";
import {
  geocodePostal,
  getProfile,
  patchProfile,
} from "../controllers/profileController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.use(requireAuth);
router.get("/", getProfile);
router.patch("/", patchProfile);
router.post("/geocode-postal", geocodePostal);

export default router;
