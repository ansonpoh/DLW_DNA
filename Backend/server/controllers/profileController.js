import { fetchProfile, updateProfile } from "../services/profileService.js";
import { geocodePostalCode } from "../services/geocodingService.js";

export async function getProfile(req, res, next) {
  try {
    const result = await fetchProfile(req.authUser);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function patchProfile(req, res, next) {
  try {
    const result = await updateProfile(req.authUser, req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function geocodePostal(req, res, next) {
  try {
    const result = await geocodePostalCode(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
