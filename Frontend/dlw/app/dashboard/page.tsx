"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type RiskZone = {
  id: string;
  label: string;
  level: "Low" | "Medium" | "High";
  explanation: string;
  tips: string;
};

const riskZones: RiskZone[] = [
  {
    id: "zone-1",
    label: "Downtown Core",
    level: "High",
    explanation: "Recent cluster of reports and higher crowd density this hour.",
    tips: "Avoid isolated lanes and use well-lit routes when possible.",
  },
  {
    id: "zone-2",
    label: "Riverside District",
    level: "Medium",
    explanation: "Weather is increasing accident risk near roads and crossings.",
    tips: "Slow down while commuting and keep extra distance in traffic.",
  },
  {
    id: "zone-3",
    label: "Residential Belt",
    level: "Low",
    explanation: "Normal activity patterns with no significant incident spikes.",
    tips: "Stay aware of surroundings and keep emergency contacts accessible.",
  },
];

const advisories = [
  {
    area: "Downtown Core",
    severity: "High",
    action: "Use main streets and avoid poorly lit shortcuts.",
    expiry: "Active for next 2 hours",
    timestamp: "11:20 AM",
  },
  {
    area: "Riverside District",
    severity: "Medium",
    action: "Drive carefully due to weather-related accident risk.",
    expiry: "Active for next 90 minutes",
    timestamp: "10:45 AM",
  },
  {
    area: "Transit Hub",
    severity: "Low",
    action: "Expect slower movement and follow station guidance.",
    expiry: "Active for next 45 minutes",
    timestamp: "10:10 AM",
  },
];

export default function DashboardPage() {
  const [zoneId, setZoneId] = useState("zone-1");

  const selectedZone = useMemo(
    () => riskZones.find((zone) => zone.id === zoneId) ?? riskZones[0],
    [zoneId],
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,#0f766e_0%,#0f172a_55%,#020617_100%)] px-6 py-10 text-slate-100 sm:px-10">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-md">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-200">
              AI Safety Hivemind
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              User Dashboard
            </h1>
            <p className="mt-2 text-sm text-slate-200 sm:text-base">
              One place to report incidents, view current area risk, and follow
              public safety advisories.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/profile"
              className="rounded-full border border-cyan-200/60 bg-cyan-300/20 px-5 py-2 text-sm font-semibold transition hover:bg-cyan-300/30"
            >
              Profile
            </Link>
            <Link
              href="/"
              className="rounded-full border border-white/40 px-5 py-2 text-sm font-semibold transition hover:bg-white/10"
            >
              Log Out
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-teal-200/30 bg-teal-100/10 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-200">
            1) Home Screen
          </p>
          <div className="mt-4 grid gap-5 lg:grid-cols-[1.2fr_2fr]">
            <Link
              href="/dashboard/report"
              className="rounded-2xl border border-rose-200/40 bg-rose-500/80 px-6 py-8 text-lg font-black uppercase tracking-[0.08em] text-white transition hover:bg-rose-400"
            >
              Report Now
            </Link>
            <div className="space-y-4">
              <div className="rounded-xl border border-white/20 bg-black/15 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-300">
                  Current Area Status
                </p>
                <p className="mt-1 text-2xl font-black text-amber-200">Medium</p>
                <p className="text-sm text-slate-200">
                  Based on your location and nearby predictive risk signals.
                </p>
              </div>
              <div className="rounded-xl border border-amber-200/40 bg-amber-200/15 p-4 text-sm text-amber-50">
                Caution: increased reports nearby. Stay in populated, well-lit
                areas and keep your phone accessible.
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/20 bg-white/10 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-200">
            2) Live Risk Map
          </p>
          <div className="mt-4 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <div className="rounded-xl border border-white/20 bg-black/15 p-4">
              <p className="text-sm font-bold text-white">Map Preview</p>
              <div className="mt-3 rounded-xl border border-white/15 bg-slate-900/70 p-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  {riskZones.map((zone) => (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => setZoneId(zone.id)}
                      className={`rounded-lg border p-4 text-left text-sm transition ${
                        zone.level === "High"
                          ? "border-rose-300/40 bg-rose-400/20"
                          : zone.level === "Medium"
                            ? "border-amber-300/40 bg-amber-300/20"
                            : "border-lime-300/40 bg-lime-300/20"
                      } ${zone.id === zoneId ? "ring-2 ring-white/50" : ""}`}
                    >
                      <p className="font-semibold">{zone.label}</p>
                      <p className="text-xs opacity-90">Risk: {zone.level}</p>
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-300">
                  Public map shows heat zones, your location dot, and advisory pins
                  only. Exact incident details are not publicly exposed.
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-white/20 bg-black/15 p-4 text-sm">
              <p className="font-bold text-white">Selected Zone Details</p>
              <p className="mt-2 text-slate-200">
                <span className="font-semibold">Risk level:</span>{" "}
                {selectedZone.level}
              </p>
              <p className="mt-2 text-slate-200">{selectedZone.explanation}</p>
              <p className="mt-3 font-semibold text-teal-200">What you can do</p>
              <p className="text-slate-200">{selectedZone.tips}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/20 bg-white/10 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
            3) Advisories and Alerts
          </p>
          <div className="mt-4 space-y-3">
            {advisories.map((item) => (
              <article
                key={`${item.area}-${item.timestamp}`}
                className="rounded-xl border border-white/20 bg-black/15 p-4 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-white">Caution in {item.area}</p>
                  <span className="rounded-full border border-white/20 px-3 py-1 text-xs">
                    {item.severity}
                  </span>
                </div>
                <p className="mt-1 text-slate-300">Timestamp: {item.timestamp}</p>
                <p className="mt-2 text-slate-100">{item.action}</p>
                <p className="mt-2 text-xs text-slate-300">{item.expiry}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/20 bg-white/10 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">
            4) Trust and Transparency
          </p>
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <article className="rounded-xl border border-white/20 bg-black/15 p-4">
              <p className="font-semibold text-white">What data we collect</p>
              <p className="mt-2 text-slate-200">
                Location, report text, and optional media uploads (voice/photo).
              </p>
            </article>
            <article className="rounded-xl border border-white/20 bg-black/15 p-4">
              <p className="font-semibold text-white">Who sees my report</p>
              <p className="mt-2 text-slate-200">
                Authorized agencies only, based on incident type and location.
              </p>
            </article>
            <article className="rounded-xl border border-white/20 bg-black/15 p-4">
              <p className="font-semibold text-white">How risk scores work</p>
              <p className="mt-2 text-slate-200">
                Scores combine historical patterns, time-of-day trends, weather,
                and incoming report clusters.
              </p>
            </article>
            <article className="rounded-xl border border-white/20 bg-black/15 p-4">
              <p className="font-semibold text-white">Anonymous mode</p>
              <p className="mt-2 text-slate-200">
                You can submit without sharing identity details while preserving
                location-based safety value.
              </p>
            </article>
          </div>
          <div className="mt-4 rounded-xl border border-rose-200/40 bg-rose-400/20 p-4 text-sm text-rose-50">
            Emergency disclaimer: If there is immediate danger, call 911 now.
            This app supports reporting and advisories but is not a replacement
            for emergency dispatch.
          </div>
        </section>
      </main>
    </div>
  );
}
