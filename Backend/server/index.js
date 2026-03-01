const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const app = express();

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || "*";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables.");
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

app.use(cors({ origin: CLIENT_URL === "*" ? true : CLIENT_URL }));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Backend server is running." });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
}); 

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  const trimmedName = String(name || "").trim();
  const trimmedEmail = String(email || "").trim().toLowerCase();

  if (!trimmedName || !trimmedEmail || !password) {
    return res.status(400).json({
      message: "Name, email, and password are required.",
    });
  }

  if (!trimmedEmail.includes("@")) {
    return res.status(400).json({ message: "Please provide a valid email." });
  }

  if (typeof password !== "string" || password.length < 3) {
    return res
      .status(400)
      .json({ message: "Password must be at least 3 characters long." });
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
    return res.status(400).json({ message: error.message });
  }

  const authUserId = data.user?.id;

  if (!authUserId) {
    return res.status(500).json({
      message: "Registration succeeded but no user ID was returned.",
    });
  }

  const { error: profileInsertError } = await supabaseAdmin
    .schema("users")
    .from("users")
    .insert({
      user_id: authUserId,
      display_name: trimmedName,
      email: trimmedEmail,
    });

  if (profileInsertError) {
    await supabaseAdmin.auth.admin.deleteUser(authUserId);

    return res.status(500).json({
      message: `Account creation failed while saving profile: ${profileInsertError.message}`,
    });
  }

  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password: String(password),
  });

  if (loginError) {
    return res.status(201).json({
      message: "Registration successful. Please sign in.",
      user: data.user,
      session: null,
    });
  }

  return res.status(201).json({
    message: "Registration successful.",
    user: loginData.user,
    session: loginData.session,
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required." });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email).trim(),
    password: String(password),
  });

  if (error) {
    return res.status(401).json({ message: error.message });
  }

  return res.status(200).json({
    message: "Login successful.",
    user: data.user,
    session: data.session,
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
