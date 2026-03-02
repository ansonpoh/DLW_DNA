"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type AdminReport = {
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
  admin_notes?: string | null;
  created_at: string | null;
  updated_at?: string | null;
};

const listEndpointCandidates = [
  process.env.NEXT_PUBLIC_ADMIN_REPORTS_LIST_PATH || "/api/admin/reports",
  "/api/reports",
  "/api/reports/all",
];

const updateEndpointPrefixCandidates = [
  process.env.NEXT_PUBLIC_ADMIN_REPORT_UPDATE_PREFIX || "/api/admin/reports",
  "/api/reports",
];

const statuses = ["submitted", "in_review", "dispatched", "resolved", "closed"];
const priorities = ["Low", "Medium", "High", "Critical"];

const getTokenFromSession = (value: unknown) => {
  const session = (value || {}) as { access_token?: string; token?: string };
  return String(session.access_token || session.token || "");
};

const getReportId = (report: AdminReport) => String(report.report_id ?? "").trim();

const asReportList = (payload: unknown): AdminReport[] => {
  if (Array.isArray(payload)) {
    return payload as AdminReport[];
  }

  const obj = payload as { reports?: unknown } | null;
  if (obj && Array.isArray(obj.reports)) {
    return obj.reports as AdminReport[];
  }

  return [];
};

export default function AdminReportsPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState("");
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [statusDraft, setStatusDraft] = useState<Record<string, string>>({});
  const [priorityDraft, setPriorityDraft] = useState<Record<string, string>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeListPath, setActiveListPath] = useState("");

  useEffect(() => {
    const adminSessionRaw = localStorage.getItem("admin_session");

    if (!adminSessionRaw) {
      router.push("/admin/login");
      return;
    }

    try {
      const parsedSession = JSON.parse(adminSessionRaw);
      const token = getTokenFromSession(parsedSession);

      if (!token) {
        router.push("/admin/login");
        return;
      }

      setAccessToken(token);
    } catch {
      router.push("/admin/login");
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
        let loadedReports: AdminReport[] = [];
        let usedEndpoint = "";

        for (const path of listEndpointCandidates) {
          try {
            const { data } = await api.get(path, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });
            const parsed = asReportList(data);
            if (parsed.length || path === listEndpointCandidates[listEndpointCandidates.length - 1]) {
              loadedReports = parsed;
              usedEndpoint = path;
              break;
            }
          } catch (endpointError) {
            const axiosError = endpointError as AxiosError;
            const status = axiosError.response?.status;
            if (status === 404 || status === 405) {
              continue;
            }
            throw endpointError;
          }
        }

        setActiveListPath(usedEndpoint);
        setReports(loadedReports);
        setStatusDraft(
          Object.fromEntries(
            loadedReports.map((report) => [
              getReportId(report),
              String(report.status || "submitted"),
            ]),
          ),
        );
        setPriorityDraft(
          Object.fromEntries(
            loadedReports.map((report) => [
              getReportId(report),
              String(report.priority || "Medium"),
            ]),
          ),
        );
        setNotesDraft(
          Object.fromEntries(
            loadedReports.map((report) => [
              getReportId(report),
              String(report.admin_notes || ""),
            ]),
          ),
        );
      } catch (err) {
        const axiosError = err as AxiosError<{ message?: string }>;
        const apiMessage = axiosError.response?.data?.message;
        setErrorMessage(apiMessage || "Unable to load reports for admin review.");
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

  const handleUpdateReport = async (report: AdminReport) => {
    const reportId = getReportId(report);
    if (!reportId) {
      return;
    }

    const nextStatus = String(statusDraft[reportId] || report.status || "submitted");
    const nextPriority = String(priorityDraft[reportId] || report.priority || "Medium");
    const nextNotes = String(notesDraft[reportId] || "");

    setSavingById((previous) => ({ ...previous, [reportId]: true }));
    setErrorMessage("");

    try {
      let updated: AdminReport | null = null;

      for (const endpointPrefix of updateEndpointPrefixCandidates) {
        const path = `${endpointPrefix}/${reportId}`;
        try {
          const { data } = await api.patch(
            path,
            {
              status: nextStatus,
              priority: nextPriority,
              admin_notes: nextNotes,
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
          );

          const asObj = data as { report?: AdminReport } | AdminReport | null;
          if (asObj && typeof asObj === "object" && "report" in asObj) {
            updated = asObj.report || null;
          } else {
            updated = asObj as AdminReport | null;
          }
          break;
        } catch (endpointError) {
          const axiosError = endpointError as AxiosError;
          const status = axiosError.response?.status;
          if (status === 404 || status === 405) {
            continue;
          }
          throw endpointError;
        }
      }

      setReports((previous) =>
        previous.map((item) => {
          if (getReportId(item) !== reportId) {
            return item;
          }

          if (updated) {
            return {
              ...item,
              ...updated,
            };
          }

          return {
            ...item,
            status: nextStatus,
            priority: nextPriority,
            admin_notes: nextNotes,
          };
        }),
      );
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      const apiMessage = axiosError.response?.data?.message;
      setErrorMessage(
        apiMessage || `Unable to update report #${report.report_id ?? "unknown"}.`,
      );
    } finally {
      setSavingById((previous) => ({ ...previous, [reportId]: false }));
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem("admin_session");
    localStorage.removeItem("admin_user");
    router.push("/admin/login");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,#9a3412_0%,#1e293b_56%,#020617_100%)] px-6 py-10 text-slate-100 sm:px-10">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-md">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">
              AI Safety Hivemind
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Admin Report Management
            </h1>
            <p className="mt-2 text-sm text-slate-200 sm:text-base">
              Review all submitted reports and update status, priority, and notes.
            </p>
            {activeListPath ? (
              <p className="mt-2 text-xs text-amber-100/90">
                Active list endpoint: {activeListPath}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="rounded-full border border-white/40 px-5 py-2 text-sm font-semibold transition hover:bg-white/10"
            >
              Admin Home
            </Link>
            <button
              type="button"
              onClick={handleAdminLogout}
              className="rounded-full border border-amber-200/60 bg-amber-300/20 px-5 py-2 text-sm font-semibold transition hover:bg-amber-300/30"
            >
              Log Out
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/20 bg-white/10 p-6">
          {isLoading ? (
            <p className="rounded-lg border border-white/20 bg-black/15 p-4 text-sm text-slate-200">
              Loading reports...
            </p>
          ) : null}

          {!isLoading && errorMessage ? (
            <p className="rounded-lg border border-rose-200/40 bg-rose-400/20 p-4 text-sm text-rose-50">
              {errorMessage}
            </p>
          ) : null}

          {!isLoading && !errorMessage && sortedReports.length === 0 ? (
            <div className="rounded-lg border border-white/20 bg-black/15 p-6 text-sm text-slate-200">
              <p className="font-semibold text-white">No reports found.</p>
              <p className="mt-2">
                If reports exist in your backend, set
                `NEXT_PUBLIC_ADMIN_REPORTS_LIST_PATH` to the correct endpoint.
              </p>
            </div>
          ) : null}

          {!isLoading && !errorMessage && sortedReports.length > 0 ? (
            <div className="space-y-4">
              {sortedReports.map((report) => {
                const reportId = getReportId(report);
                const createdLabel = report.created_at
                  ? new Date(report.created_at).toLocaleString()
                  : "Unknown timestamp";
                const updatedLabel = report.updated_at
                  ? new Date(report.updated_at).toLocaleString()
                  : "";
                const isSaving = savingById[reportId] === true;
                const currentStatus = statusDraft[reportId] || report.status || "submitted";
                const currentPriority =
                  priorityDraft[reportId] || report.priority || "Medium";
                const currentNotes = notesDraft[reportId] || "";

                return (
                  <article
                    key={reportId || `${report.created_at || "no-date"}-${report.type || "unknown-type"}`}
                    className="rounded-xl border border-white/20 bg-black/15 p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-base font-bold text-white">
                        {`Report #${report.report_id ?? "-"}`}
                      </p>
                      <span className="rounded-full border border-white/25 px-3 py-1 text-xs text-slate-100">
                        {currentStatus}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-slate-200 sm:grid-cols-2">
                      <p>
                        <span className="font-semibold text-slate-100">Type:</span>{" "}
                        {report.type || "-"}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-100">Priority:</span>{" "}
                        {currentPriority}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-100">Submitted:</span>{" "}
                        {createdLabel}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-100">Location:</span>{" "}
                        {report.location_label || "-"}
                      </p>
                    </div>

                    <p className="mt-3 text-slate-100">
                      <span className="font-semibold">Description:</span>{" "}
                      {report.description || "-"}
                    </p>

                    <div className="mt-3 grid gap-3 lg:grid-cols-3">
                      <label className="text-xs">
                        <span className="mb-1 block font-semibold uppercase tracking-[0.08em] text-slate-300">
                          Status
                        </span>
                        <select
                          value={currentStatus}
                          onChange={(event) =>
                            setStatusDraft((previous) => ({
                              ...previous,
                              [reportId]: event.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-white/25 bg-slate-900 p-2 text-sm text-slate-100"
                        >
                          {statuses.map((statusValue) => (
                            <option key={statusValue} value={statusValue}>
                              {statusValue}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-xs">
                        <span className="mb-1 block font-semibold uppercase tracking-[0.08em] text-slate-300">
                          Priority
                        </span>
                        <select
                          value={currentPriority}
                          onChange={(event) =>
                            setPriorityDraft((previous) => ({
                              ...previous,
                              [reportId]: event.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-white/25 bg-slate-900 p-2 text-sm text-slate-100"
                        >
                          {priorities.map((priorityValue) => (
                            <option key={priorityValue} value={priorityValue}>
                              {priorityValue}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-xs lg:col-span-1">
                        <span className="mb-1 block font-semibold uppercase tracking-[0.08em] text-slate-300">
                          Admin Notes
                        </span>
                        <textarea
                          value={currentNotes}
                          onChange={(event) =>
                            setNotesDraft((previous) => ({
                              ...previous,
                              [reportId]: event.target.value,
                            }))
                          }
                          rows={3}
                          className="w-full rounded-md border border-white/25 bg-slate-900 p-2 text-sm text-slate-100"
                          placeholder="Optional internal notes"
                        />
                      </label>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-300">
                        {updatedLabel ? `Last updated: ${updatedLabel}` : "Not updated yet"}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUpdateReport(report)}
                        disabled={isSaving}
                        className="rounded-full border border-amber-100/50 bg-amber-400 px-5 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-300"
                      >
                        {isSaving ? "Saving..." : "Update Report"}
                      </button>
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
