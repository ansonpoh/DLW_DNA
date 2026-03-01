import { supabase } from "../config/supabase.js";

export async function requireAuth(req, res, next) {
  try {
    const authorizationHeader = String(req.headers.authorization || "");

    if (!authorizationHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing authorization token." });
    }

    const accessToken = authorizationHeader.slice(7).trim();

    if (!accessToken) {
      return res.status(401).json({ message: "Missing authorization token." });
    }

    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      return res.status(401).json({ message: "Invalid or expired session." });
    }

    req.authUser = data.user;
    req.accessToken = accessToken;
    return next();
  } catch (error) {
    return res.status(500).json({
      message: `Unable to validate authentication: ${error.message}`,
    });
  }
}
