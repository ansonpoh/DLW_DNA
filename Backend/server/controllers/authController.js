import { loginUser, registerUser } from "../services/authService.js";

export async function register(req, res, next) {
  try {
    const result = await registerUser(req.body || {});
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return next(error);
  }
}

export async function login(req, res, next) {
  try {
    const result = await loginUser(req.body || {});
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return next(error);
  }
}
