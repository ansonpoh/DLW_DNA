"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import InteractiveLocationMap from "../profile/InteractiveLocationMap";

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
  const router = useRouter();
  const [selectedType, setSelectedType] = useState("Medical");
  const [description, setDescription] = useState("");
  const [happeningNow, setHappeningNow] = useState(true);
  const [safeToContinue, setSafeToContinue] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [profileLocations, setProfileLocations] = useState<
    Array<{
      key: "home" | "work";
      label: string;
      lat: number | null;
      lng: number | null;
    }>
  >([]);
  const [locationError, setLocationError] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [manualLocationInput, setManualLocationInput] = useState("");
  const [activeMapPicker, setActiveMapPicker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{
    source: "stored" | "current" | "map" | "manual";
    label: string;
    lat: number | null;
    lng: number | null;
  }>({
    source: "manual",
    label: "",
    lat: null,
    lng: null,
  });

  const loadStoredLocations = async (token: string) => {
    try {
      const { data } = await api.get("/api/profile", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const homeLabel = String(data.profile?.home_location || "").trim();
      const workLabel = String(data.profile?.work_location || "").trim();
      const homeLatRaw = data.profile?.home_lat;
      const homeLngRaw = data.profile?.home_lng;
      const workLatRaw = data.profile?.work_lat;
      const workLngRaw = data.profile?.work_lng;

      const locations: Array<{
        key: "home" | "work";
        label: string;
        lat: number | null;
        lng: number | null;
      }> = [];

      if (homeLabel) {
        locations.push({
          key: "home",
          label: homeLabel,
          lat: homeLatRaw === null || homeLatRaw === undefined ? null : Number(homeLatRaw),
          lng: homeLngRaw === null || homeLngRaw === undefined ? null : Number(homeLngRaw),
        });
      }

      if (workLabel) {
        locations.push({
          key: "work",
          label: workLabel,
          lat: workLatRaw === null || workLatRaw === undefined ? null : Number(workLatRaw),
          lng: workLngRaw === null || workLngRaw === undefined ? null : Number(workLngRaw),
        });
      }

      setProfileLocations(locations);

      if (locations.length) {
        const preferred =
          locations.find((entry) => entry.key === "home") || locations[0];
        setSelectedLocation({
          source: "stored",
          label: preferred.label,
          lat: preferred.lat,
          lng: preferred.lng,
        });
        setManualLocationInput(preferred.label);
      }
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      const apiMessage = axiosError.response?.data?.message;
      setLocationError(apiMessage || "Unable to load stored profile locations.");
    }
  };

  const initialMapPoint = useMemo(() => {
    if (selectedLocation.lat !== null && selectedLocation.lng !== null) {
      return {
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
      };
    }

    const firstStoredWithCoords = profileLocations.find(
      (entry) => entry.lat !== null && entry.lng !== null,
    );

    if (firstStoredWithCoords) {
      return { lat: firstStoredWithCoords.lat, lng: firstStoredWithCoords.lng };
    }

    return { lat: null, lng: null };
  }, [profileLocations, selectedLocation.lat, selectedLocation.lng]);

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
      const loadTimer = window.setTimeout(() => {
        void loadStoredLocations(token);
      }, 0);
      return () => window.clearTimeout(loadTimer);
    } catch {
      router.push("/login");
    }
  }, [router]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported in this browser.");
      return;
    }

    setIsLocating(true);
    setLocationError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        const label = `Current location (${lat}, ${lng})`;
        setSelectedLocation({
          source: "current",
          label,
          lat,
          lng,
        });
        setManualLocationInput(label);
        setIsLocating(false);
      },
      () => {
        setLocationError("Unable to access current location.");
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      },
    );
  };

  const handleChooseStoredLocation = (locationKey: "home" | "work") => {
    const locationEntry = profileLocations.find((entry) => entry.key === locationKey);
    if (!locationEntry) {
      return;
    }

    setSelectedLocation({
      source: "stored",
      label: locationEntry.label,
      lat: locationEntry.lat,
      lng: locationEntry.lng,
    });
    setManualLocationInput(locationEntry.label);
    setLocationError("");
  };

  const handleMapConfirm = (point: { lat: number; lng: number }, address: string) => {
    const fallback = `Pinned location (${point.lat.toFixed(6)}, ${point.lng.toFixed(6)})`;
    const label = String(address || "").trim() || fallback;
    setSelectedLocation({
      source: "map",
      label,
      lat: point.lat,
      lng: point.lng,
    });
    setManualLocationInput(label);
    setLocationError("");
    setActiveMapPicker(false);
  };

  const handleManualLocationApply = () => {
    const value = manualLocationInput.trim();
    if (!value) {
      setLocationError("Please enter a landmark or postal value.");
      return;
    }

    setSelectedLocation({
      source: "manual",
      label: value,
      lat: selectedLocation.lat,
      lng: selectedLocation.lng,
    });
    setLocationError("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    setSubmitted(false);

    if (!description.trim()) {
      setSubmitError("Please describe what happened before submitting.");
      return;
    }

    if (!accessToken) {
      setSubmitError("Session expired. Please sign in again.");
      return;
    }

    const locationLabel = selectedLocation.label.trim() || manualLocationInput.trim();
    if (!locationLabel) {
      setSubmitError("Please provide a location label for the report.");
      return;
    }

    const estimatedPriority = happeningNow ? "High" : "Medium";
    setIsSubmitting(true);

    try {
      const payload = {
        type: selectedType,
        description: description.trim(),
        happening_now: happeningNow,
        safe_to_continue: safeToContinue,
        location_label: locationLabel,
        location_source: selectedLocation.source,
        latitude: selectedLocation.lat,
        longitude: selectedLocation.lng,
        priority: estimatedPriority,
      };

      await api.post("/api/reports", payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      setSubmitted(true);
      setDescription("");
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      const apiMessage = axiosError.response?.data?.message;
      setSubmitError(apiMessage || "Unable to submit report right now.");
    } finally {
      setIsSubmitting(false);
    }
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
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/report/submitted"
              className="rounded-full border border-cyan-200/60 bg-cyan-300/20 px-5 py-2 text-sm font-semibold transition hover:bg-cyan-300/30"
            >
              My Reports
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
              <div className="mt-3 space-y-3">
                {profileLocations.length ? (
                  <div className="rounded-lg border border-cyan-200/40 bg-cyan-100/10 p-3 text-sm text-cyan-50">
                    <p className="font-semibold">Stored profile locations</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {profileLocations.map((entry) => (
                        <button
                          key={entry.key}
                          type="button"
                          onClick={() => handleChooseStoredLocation(entry.key)}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            selectedLocation.source === "stored" &&
                            selectedLocation.label === entry.label
                              ? "border-cyan-100 bg-cyan-300/30 text-cyan-50"
                              : "border-cyan-200/50 bg-cyan-200/10 text-cyan-100 hover:bg-cyan-200/20"
                          }`}
                        >
                          {entry.key === "home" ? "Home" : "Work"}: {entry.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/20 bg-white/5 p-3 text-xs text-slate-300">
                    No stored locations in profile yet.
                  </div>
                )}

                <div className="rounded-lg border border-cyan-200/40 bg-cyan-100/10 p-3 text-sm text-cyan-50">
                  Selected location: {selectedLocation.label || "Not selected"}
                  {selectedLocation.lat !== null && selectedLocation.lng !== null ? (
                    <span>
                      {" "}
                      | {selectedLocation.lat.toFixed(6)},{" "}
                      {selectedLocation.lng.toFixed(6)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={isLocating}
                  className="rounded-full border border-white/30 px-4 py-2 text-sm hover:bg-white/10"
                >
                  {isLocating ? "Locating..." : "Use my current location"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMapPicker(true)}
                  className="rounded-full border border-white/30 px-4 py-2 text-sm hover:bg-white/10"
                >
                  Adjust pin on map
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={manualLocationInput}
                  onChange={(event) => setManualLocationInput(event.target.value)}
                  placeholder="Enter landmark or postal"
                  className="min-w-[220px] flex-1 rounded-lg border border-white/25 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none ring-teal-300/60 transition focus:ring-2"
                />
                <button
                  type="button"
                  onClick={handleManualLocationApply}
                  className="rounded-full border border-white/30 px-4 py-2 text-sm hover:bg-white/10"
                >
                  Apply
                </button>
              </div>
              {locationError ? (
                <p className="mt-3 rounded-lg border border-rose-200/40 bg-rose-400/20 p-3 text-sm text-rose-50">
                  {locationError}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-white/20 bg-black/15 p-4">
              <p className="text-sm font-bold text-white">
                Step D - Safety check and consent
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
              {submitError ? (
                <p className="mt-3 rounded-lg border border-rose-200/40 bg-rose-400/20 p-3 text-sm text-rose-50">
                  {submitError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-3 rounded-full border border-teal-100/50 bg-teal-400 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-teal-300"
              >
                {isSubmitting ? "Submitting..." : "Submit Report"}
              </button>
              {submitted ? (
                <div className="mt-4 space-y-2 rounded-lg border border-emerald-200/40 bg-emerald-300/20 p-4 text-sm text-emerald-50">
                  <p className="font-semibold">Report received</p>
                  <p>You may be contacted for clarification.</p>
                  <Link
                    href="/dashboard/report/submitted"
                    className="inline-flex rounded-full border border-emerald-100/40 bg-emerald-100/20 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-100/30"
                  >
                    View my submitted reports
                  </Link>
                </div>
              ) : null}
            </div>
          </form>
        </section>
      </main>

      {activeMapPicker ? (
        <InteractiveLocationMap
          isOpen
          title="Pick Incident Location"
          initialLat={initialMapPoint.lat}
          initialLng={initialMapPoint.lng}
          onCancel={() => setActiveMapPicker(false)}
          onConfirm={(point, address) => handleMapConfirm(point, address)}
        />
      ) : null}
    </div>
  );
}

