import { prisma } from "../config/prisma.js";
import { supabase, supabaseAdmin } from "../config/supabase.js";
import { isSupabaseUserAdmin } from "./adminService.js";
import { HttpError } from "../utils/httpError.js";

export async function registerUser(payload) {
  const { name, email, password } = payload;
  const trimmedName = String(name || "").trim();
  const trimmedEmail = String(email || "").trim().toLowerCase();

  if (!trimmedName || !trimmedEmail || !password) {
    throw new HttpError(400, "Name, email, and password are required.");
  }

  if (!trimmedEmail.includes("@")) {
    throw new HttpError(400, "Please provide a valid email.");
  }

  if (typeof password !== "string" || password.length < 3) {
    throw new HttpError(400, "Password must be at least 3 characters long.");
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: trimmedEmail,
    password,
    email_confirm: true,
    user_metadata: {
      name: trimmedName,
    },
  });

  if (error) {
    throw new HttpError(400, error.message);
  }

  const authUserId = data.user?.id;

  if (!authUserId) {
    throw new HttpError(500, "Registration succeeded but no user ID was returned.");
  }

  try {
    const profileInsertSql =
      "insert into users.users (supabase_id, display_name, email) values ($1::uuid, $2, $3)";
    await prisma.$executeRawUnsafe(profileInsertSql, authUserId, trimmedName, trimmedEmail);
  } catch (profileInsertError) {
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
    throw new HttpError(
      500,
      `Account creation failed while saving profile: ${profileInsertError.message}`,
    );
  }

  const { data: loginData, error: loginError } =
    await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: String(password),
    });

  if (loginError) {
    return {
      statusCode: 201,
      body: {
        message: "Registration successful. Please sign in.",
        user: data.user,
        session: null,
      },
    };
  }

  return {
    statusCode: 201,
    body: {
      message: "Registration successful.",
      user: loginData.user,
      session: loginData.session,
    },
  };
}

export async function loginUser(payload) {
  const { email, password } = payload;

  if (!email || !password) {
    throw new HttpError(400, "Email and password are required.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email).trim(),
    password: String(password),
  });

  if (error) {
    throw new HttpError(401, error.message);
  }

  return {
    statusCode: 200,
    body: {
      message: "Login successful.",
      user: data.user,
      session: data.session,
    },
  };
}

export async function loginAdminUser(payload) {
  const loginResult = await loginUser(payload);
  const userId = loginResult?.body?.user?.id;

  if (!userId) {
    throw new HttpError(401, "Unable to validate admin account.");
  }

  const isAdmin = await isSupabaseUserAdmin(userId);

  if (!isAdmin) {
    throw new HttpError(403, "This account does not have admin access.");
  }

  return {
    ...loginResult,
    body: {
      ...loginResult.body,
      user: {
        ...loginResult.body.user,
        role: "admin",
        is_admin: true,
      },
    },
  };
}
