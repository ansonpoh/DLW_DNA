"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { useState } from "react";
import { api } from "@/lib/api";

type LoginResponse = {
  session?: unknown;
  user?: {
    role?: string;
    user_role?: string;
    is_admin?: boolean;
  } | null;
};

const adminLoginPath =
  process.env.NEXT_PUBLIC_ADMIN_LOGIN_PATH || "/api/auth/admin/login";

const fallbackAdminLoginPath = "/api/auth/login";

const getUserRole = (user: LoginResponse["user"]) => {
  if (!user) {
    return "";
  }

  if (typeof user.role === "string") {
    return user.role.toLowerCase();
  }

  if (typeof user.user_role === "string") {
    return user.user_role.toLowerCase();
  }

  return "";
};

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }

    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);

    try {
      let response;

      try {
        response = await api.post<LoginResponse>(adminLoginPath, {
          email: email.trim(),
          password,
        });
      } catch (primaryError) {
        const axiosError = primaryError as AxiosError;
        if (axiosError.response?.status === 404 || axiosError.response?.status === 405) {
          response = await api.post<LoginResponse>(fallbackAdminLoginPath, {
            email: email.trim(),
            password,
          });
        } else {
          throw primaryError;
        }
      }

      const data = response.data || {};
      const role = getUserRole(data.user);
      const isExplicitlyAdmin = data.user?.is_admin === true || role.includes("admin");
      const isExplicitlyNonAdmin =
        (data.user?.is_admin === false && role !== "") ||
        (role !== "" && !role.includes("admin"));

      if (isExplicitlyNonAdmin && !isExplicitlyAdmin) {
        setError("This account does not have admin access.");
        setIsSubmitting(false);
        return;
      }

      localStorage.setItem("admin_session", JSON.stringify(data.session || {}));
      localStorage.setItem("admin_user", JSON.stringify(data.user || {}));
      setMessage("Admin login successful. Redirecting...");
      window.setTimeout(() => {
        router.push("/admin/reports");
      }, 500);
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      const apiMessage = axiosError.response?.data?.message;
      setError(apiMessage || "Unable to sign in as admin.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_12%,#9a3412_0%,#1e293b_62%,#020617_100%)] px-6 py-10 text-slate-100 sm:px-10">
      <main className="mx-auto w-full max-w-xl rounded-3xl border border-white/20 bg-white/10 p-8 backdrop-blur-md sm:p-10">
        <div className="mb-8 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-black tracking-tight">Admin Login</h1>
          <Link
            href="/"
            className="rounded-full border border-white/40 px-4 py-2 text-sm font-semibold transition hover:bg-white/10"
          >
            Back Home
          </Link>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="email">
              Admin Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3 text-sm outline-none ring-amber-300/60 transition focus:ring-2"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3 text-sm outline-none ring-amber-300/60 transition focus:ring-2"
              placeholder="Enter your password"
            />
          </div>

          {error ? (
            <p className="rounded-xl border border-rose-300/40 bg-rose-400/15 px-4 py-3 text-sm text-rose-100">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="rounded-xl border border-emerald-300/40 bg-emerald-400/15 px-4 py-3 text-sm text-emerald-100">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl border border-amber-100/50 bg-amber-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
          >
            {isSubmitting ? "Signing In..." : "Sign In as Admin"}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-200">
          User account sign-in?{" "}
          <Link href="/login" className="font-semibold text-teal-200 underline">
            Go to user login
          </Link>
        </p>
      </main>
    </div>
  );
}
