import { supabase } from "../config/supabase.js";
import { findAdminBySupabaseId } from "../services/adminService.js";

export async function requireAdminAuth(req, res, next) {
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

    const adminRow = await findAdminBySupabaseId(data.user.id);
    if (!adminRow) {
      return res.status(403).json({ message: "Admin access required." });
    }

    req.authUser = data.user;
    req.accessToken = accessToken;
    req.admin = adminRow;
    return next();
  } catch (error) {
    return res.status(500).json({
      message: `Unable to validate admin authentication: ${error.message}`,
    });
  }
}
