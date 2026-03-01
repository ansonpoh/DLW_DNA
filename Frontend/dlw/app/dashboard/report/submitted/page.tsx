"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type SubmittedReport = {
  report_id: string | number | null;
  type: string;
  description: string;
  happening_now: boolean;
  safe_to_continue: boolean;
  location_label: string;
  location_source: string;
  latitude: number | null;
  longitude: number | null;
  priority: string;
  status: string;
  created_at: string | null;
};

export default function SubmittedReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<SubmittedReport[]>([]);
  const [accessToken, setAccessToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const sessionRaw = localStorage.getItem("supabase_session");

    if (!sessionRaw) {
      router.push("/login");
      return;
    }

    try {
      const parsedSession = JSON.parse(sessionRaw) as { access_token?: string };
      const token = String(parsedSession?.access_token || "");

      if (!token) {
        router.push("/login");
        return;
      }

      setAccessToken(token);
    } catch {
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const fetchReports = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const { data } = await api.get<{ reports?: SubmittedReport[] }>("/api/reports/mine", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const nextReports = Array.isArray(data?.reports) ? data.reports : [];
        setReports(nextReports);
      } catch (err) {
        const axiosError = err as AxiosError<{ message?: string }>;
        const apiMessage = axiosError.response?.data?.message;
        setErrorMessage(apiMessage || "Unable to load your submitted reports right now.");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchReports();
  }, [accessToken]);

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bDate - aDate;
    });
  }, [reports]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,#0f766e_0%,#0f172a_55%,#020617_100%)] px-6 py-10 text-slate-100 sm:px-10">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-md">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-200">
              AI Safety Hivemind
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              My Submitted Reports
            </h1>
            <p className="mt-2 text-sm text-slate-200 sm:text-base">
              Review your previously submitted incident reports and their status.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/report"
              className="rounded-full border border-cyan-200/60 bg-cyan-300/20 px-5 py-2 text-sm font-semibold transition hover:bg-cyan-300/30"
            >
              New Report
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full border border-white/40 px-5 py-2 text-sm font-semibold transition hover:bg-white/10"
            >
              Back to Dashboard
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-white/20 bg-white/10 p-6">
          {isLoading ? (
            <p className="rounded-lg border border-white/20 bg-black/15 p-4 text-sm text-slate-200">
              Loading your reports...
            </p>
          ) : null}

          {!isLoading && errorMessage ? (
            <p className="rounded-lg border border-rose-200/40 bg-rose-400/20 p-4 text-sm text-rose-50">
              {errorMessage}
            </p>
          ) : null}

          {!isLoading && !errorMessage && sortedReports.length === 0 ? (
            <div className="rounded-lg border border-white/20 bg-black/15 p-6 text-sm text-slate-200">
              <p className="font-semibold text-white">No reports submitted yet.</p>
              <p className="mt-2">
                Submit your first incident report to start building your report history.
              </p>
            </div>
          ) : null}

          {!isLoading && !errorMessage && sortedReports.length > 0 ? (
            <div className="space-y-4">
              {sortedReports.map((report) => {
                const createdLabel = report.created_at
                  ? new Date(report.created_at).toLocaleString()
                  : "Unknown timestamp";

                return (
                  <article
                    key={String(report.report_id ?? "-")}
                    className="rounded-xl border border-white/20 bg-black/15 p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-base font-bold text-white">
                        {`Report #${report.report_id ?? "-"}`}
                      </p>
                      <span className="rounded-full border border-white/25 px-3 py-1 text-xs text-slate-100">
                        {report.status || "submitted"}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-slate-200 sm:grid-cols-2">
                      <p>
                        <span className="font-semibold text-slate-100">Type:</span> {report.type || "-"}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-100">Priority:</span> {report.priority || "Medium"}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-100">Submitted:</span> {createdLabel}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-100">Location:</span> {report.location_label || "-"}
                      </p>
                    </div>

                    <p className="mt-3 text-slate-100">
                      <span className="font-semibold">Description:</span> {report.description || "-"}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                      <span className="rounded-full border border-white/20 px-2 py-1">
                        Happening now: {report.happening_now ? "Yes" : "No"}
                      </span>
                      <span className="rounded-full border border-white/20 px-2 py-1">
                        Safe to continue: {report.safe_to_continue ? "Yes" : "No"}
                      </span>
                      <span className="rounded-full border border-white/20 px-2 py-1">
                        Source: {report.location_source || "manual"}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}


