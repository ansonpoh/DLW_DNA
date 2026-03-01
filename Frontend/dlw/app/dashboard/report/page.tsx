"use client";

import Link from "next/link";
import { useState } from "react";

const reportTypes = [
  "Medical",
  "Fire/Smoke",
  "Violence/Fight",
  "Suspicious person/activity",
  "Harassment",
  "Accident/Traffic",
  "Other",
];

export default function ReportPage() {
  const [selectedType, setSelectedType] = useState("Medical");
  const [description, setDescription] = useState("");
  const [happeningNow, setHappeningNow] = useState(true);
  const [safeToContinue, setSafeToContinue] = useState(true);
  const [anonymous, setAnonymous] = useState(false);
  const [submittedCode, setSubmittedCode] = useState("");
  const [priority, setPriority] = useState<"Medium" | "High">("Medium");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const generatedCode = `ASH-${Math.floor(1000 + Math.random() * 9000)}`;
    const estimatedPriority = happeningNow ? "High" : "Medium";
    setPriority(estimatedPriority);
    setSubmittedCode(generatedCode);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,#0f766e_0%,#0f172a_55%,#020617_100%)] px-6 py-10 text-slate-100 sm:px-10">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-md">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-200">
              AI Safety Hivemind
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Report Incident
            </h1>
            <p className="mt-2 text-sm text-slate-200 sm:text-base">
              Fast reporting flow with location context and safety-first checks.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-white/40 px-5 py-2 text-sm font-semibold transition hover:bg-white/10"
          >
            Back to Dashboard
          </Link>
        </section>

        <section className="rounded-2xl border border-white/20 bg-white/10 p-6">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="rounded-xl border border-white/20 bg-black/15 p-4">
              <p className="text-sm font-bold text-white">
                Step A - Choose report type
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {reportTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    className={`rounded-lg border px-3 py-2 text-sm transition ${
                      selectedType === type
                        ? "border-teal-200 bg-teal-300/30 text-teal-50"
                        : "border-white/25 bg-white/5 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/20 bg-black/15 p-4">
              <p className="text-sm font-bold text-white">
                Step B - Describe what happened
              </p>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe what is happening"
                className="mt-3 min-h-28 w-full rounded-lg border border-white/25 bg-white/5 p-3 text-sm text-slate-100 outline-none ring-teal-300/60 transition focus:ring-2"
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="rounded-lg border border-white/20 bg-white/5 p-3 text-sm text-slate-200">
                  Optional: Upload voice note
                  <input type="file" accept="audio/*" className="mt-2 block w-full text-xs" />
                </label>
                <label className="rounded-lg border border-white/20 bg-white/5 p-3 text-sm text-slate-200">
                  Optional: Upload photo (if safe)
                  <input type="file" accept="image/*" className="mt-2 block w-full text-xs" />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-white/20 bg-black/15 p-4">
              <p className="text-sm font-bold text-white">Step C - Location</p>
              <div className="mt-3 rounded-lg border border-cyan-200/40 bg-cyan-100/10 p-3 text-sm text-cyan-50">
                Auto-detected GPS pin: 1.3521, 103.8198 | Accuracy: High
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full border border-white/30 px-4 py-2 text-sm hover:bg-white/10"
                >
                  Use my current location
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/30 px-4 py-2 text-sm hover:bg-white/10"
                >
                  Adjust pin on map
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/30 px-4 py-2 text-sm hover:bg-white/10"
                >
                  Enter landmark/postal
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/20 bg-black/15 p-4">
              <p className="text-sm font-bold text-white">
                Step D - Safety check and consent
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="rounded-lg border border-white/20 bg-white/5 p-3 text-sm">
                  <span className="font-semibold text-slate-100">Happening now?</span>
                  <select
                    value={happeningNow ? "yes" : "no"}
                    onChange={(event) => setHappeningNow(event.target.value === "yes")}
                    className="mt-2 w-full rounded-md border border-white/25 bg-slate-900 p-2 text-slate-100"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className="rounded-lg border border-white/20 bg-white/5 p-3 text-sm">
                  <span className="font-semibold text-slate-100">
                    Are you safe to continue?
                  </span>
                  <select
                    value={safeToContinue ? "yes" : "no"}
                    onChange={(event) => setSafeToContinue(event.target.value === "yes")}
                    className="mt-2 w-full rounded-md border border-white/25 bg-slate-900 p-2 text-slate-100"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className="rounded-lg border border-white/20 bg-white/5 p-3 text-sm">
                  <span className="font-semibold text-slate-100">Share anonymously?</span>
                  <select
                    value={anonymous ? "yes" : "no"}
                    onChange={(event) => setAnonymous(event.target.value === "yes")}
                    className="mt-2 w-full rounded-md border border-white/25 bg-slate-900 p-2 text-slate-100"
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </label>
              </div>
              {!safeToContinue ? (
                <p className="mt-3 rounded-lg border border-rose-200/40 bg-rose-400/20 p-3 text-sm text-rose-50">
                  Move to safety first. If immediate danger exists, call emergency
                  services now at 911.
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-white/20 bg-black/15 p-4">
              <p className="text-sm font-bold text-white">Step E - Submit</p>
              <button
                type="submit"
                className="mt-3 rounded-full border border-teal-100/50 bg-teal-400 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-teal-300"
              >
                Submit Report
              </button>
              {submittedCode ? (
                <div className="mt-4 space-y-2 rounded-lg border border-emerald-200/40 bg-emerald-300/20 p-4 text-sm text-emerald-50">
                  <p className="font-semibold">Report received</p>
                  <p>Reference code: {submittedCode}</p>
                  <p>Estimated priority: {priority}</p>
                  <p>You may be contacted for clarification.</p>
                  <button
                    type="button"
                    className="rounded-full border border-emerald-100/40 px-4 py-2 text-xs font-semibold hover:bg-emerald-100/15"
                  >
                    Add more info
                  </button>
                </div>
              ) : null}
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
