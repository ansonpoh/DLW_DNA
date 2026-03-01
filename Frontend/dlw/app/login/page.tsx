"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { useState } from "react";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");

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
      const { data } = await api.post("/api/auth/login", {
          email: email.trim(),
          password,
      });
      localStorage.setItem("supabase_session", JSON.stringify(data.session));
      localStorage.setItem("supabase_user", JSON.stringify(data.user));

      setMessage("Login successful. Redirecting to your dashboard...");
      window.setTimeout(() => {
        router.push("/dashboard");
      }, 500);
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      const apiMessage = axiosError.response?.data?.message;
      setError(apiMessage || "Unable to reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_15%,#164e63_0%,#0f172a_65%,#020617_100%)] px-6 py-10 text-slate-100 sm:px-10">
      <main className="mx-auto w-full max-w-xl rounded-3xl border border-white/20 bg-white/10 p-8 backdrop-blur-md sm:p-10">
        <div className="mb-8 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-black tracking-tight">Login</h1>
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
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3 text-sm outline-none ring-teal-300/60 transition focus:ring-2"
              placeholder="you@example.com"
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
              className="w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3 text-sm outline-none ring-teal-300/60 transition focus:ring-2"
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
            className="w-full rounded-xl border border-teal-100/50 bg-teal-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-teal-300"
          >
            {isSubmitting ? "Signing In..." : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-200">
          New user?{" "}
          <Link href="/register" className="font-semibold text-teal-200 underline">
            Create an account
          </Link>
        </p>
      </main>
    </div>
  );
}
