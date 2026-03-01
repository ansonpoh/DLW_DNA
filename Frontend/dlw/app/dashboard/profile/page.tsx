"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import InteractiveLocationMap from "./InteractiveLocationMap";

type ProfileForm = {
  display_name: string;
  email: string;
  phone_number: string;
  home_location: string;
  home_lat: string;
  home_lng: string;
  work_location: string;
  work_lat: string;
  work_lng: string;
};

const initialProfile: ProfileForm = {
  display_name: "",
  email: "",
  phone_number: "",
  home_location: "",
  home_lat: "",
  home_lng: "",
  work_location: "",
  work_lat: "",
  work_lng: "",
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileForm>(initialProfile);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [activeMapPicker, setActiveMapPicker] = useState<"home" | "work" | null>(
    null,
  );

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
      void loadProfile(token);
    } catch {
      router.push("/login");
    }
  }, [router]);

  const loadProfile = async (token: string) => {
    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      const { data } = await api.get("/api/profile", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setProfile({
        display_name: String(data.profile?.display_name || ""),
        email: String(data.profile?.email || ""),
        phone_number: String(data.profile?.phone_number || ""),
        home_location: String(data.profile?.home_location || ""),
        home_lat:
          data.profile?.home_lat === null || data.profile?.home_lat === undefined
            ? ""
            : String(data.profile.home_lat),
        home_lng:
          data.profile?.home_lng === null || data.profile?.home_lng === undefined
            ? ""
            : String(data.profile.home_lng),
        work_location: String(data.profile?.work_location || ""),
        work_lat:
          data.profile?.work_lat === null || data.profile?.work_lat === undefined
            ? ""
            : String(data.profile.work_lat),
        work_lng:
          data.profile?.work_lng === null || data.profile?.work_lng === undefined
            ? ""
            : String(data.profile.work_lng),
      });
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      const apiMessage = axiosError.response?.data?.message;
      setError(apiMessage || "Unable to load profile details.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange =
    (field: keyof ProfileForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setProfile((previous) => ({
        ...previous,
        [field]: event.target.value,
      }));
    };

  const handleMapConfirm = (
    target: "home" | "work",
    lat: number,
    lng: number,
    address: string,
  ) => {
    const latValue = lat.toFixed(6);
    const lngValue = lng.toFixed(6);
    const locationText = address.trim();

    setProfile((previous) => {
      if (target === "home") {
        return {
          ...previous,
          home_lat: latValue,
          home_lng: lngValue,
          home_location:
            locationText || previous.home_location || "Pinned home location",
        };
      }

      return {
        ...previous,
        work_lat: latValue,
        work_lng: lngValue,
        work_location:
          locationText || previous.work_location || "Pinned work location",
      };
    });

    setActiveMapPicker(null);
    setMessage("Location pinned from map.");
    setError("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!profile.display_name.trim()) {
      setError("Display name is required.");
      return;
    }

    if (!profile.email.trim() || !profile.email.includes("@")) {
      setError("Please provide a valid email address.");
      return;
    }

    if (!accessToken) {
      setError("Session expired. Please sign in again.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        display_name: profile.display_name.trim(),
        email: profile.email.trim().toLowerCase(),
        phone_number: profile.phone_number.trim(),
        home_location: profile.home_location.trim(),
        home_lat: profile.home_lat.trim() ? Number(profile.home_lat.trim()) : null,
        home_lng: profile.home_lng.trim() ? Number(profile.home_lng.trim()) : null,
        work_location: profile.work_location.trim(),
        work_lat: profile.work_lat.trim() ? Number(profile.work_lat.trim()) : null,
        work_lng: profile.work_lng.trim() ? Number(profile.work_lng.trim()) : null,
      };

      const { data } = await api.patch("/api/profile", payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      setProfile({
        display_name: String(data.profile?.display_name || payload.display_name),
        email: String(data.profile?.email || payload.email),
        phone_number: String(data.profile?.phone_number || payload.phone_number),
        home_location: String(data.profile?.home_location || payload.home_location),
        home_lat:
          data.profile?.home_lat === null || data.profile?.home_lat === undefined
            ? ""
            : String(data.profile.home_lat),
        home_lng:
          data.profile?.home_lng === null || data.profile?.home_lng === undefined
            ? ""
            : String(data.profile.home_lng),
        work_location: String(data.profile?.work_location || payload.work_location),
        work_lat:
          data.profile?.work_lat === null || data.profile?.work_lat === undefined
            ? ""
            : String(data.profile.work_lat),
        work_lng:
          data.profile?.work_lng === null || data.profile?.work_lng === undefined
            ? ""
            : String(data.profile.work_lng),
      });
      setMessage("Profile details saved.");
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      const apiMessage = axiosError.response?.data?.message;
      setError(apiMessage || "Unable to save profile details.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_12%,#0369a1_0%,#0f172a_62%,#020617_100%)] px-6 py-10 text-slate-100 sm:px-10">
      <main className="mx-auto w-full max-w-3xl rounded-3xl border border-white/20 bg-white/10 p-8 backdrop-blur-md sm:p-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">
              Account
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
              User Profile
            </h1>
            <p className="mt-2 text-sm text-slate-200">
              Manage the details used in your account and safety preferences.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-white/40 px-4 py-2 text-sm font-semibold transition hover:bg-white/10"
          >
            Back to Dashboard
          </Link>
        </div>

        {isLoading ? (
          <p className="rounded-xl border border-white/20 bg-black/20 px-4 py-3 text-sm text-slate-100">
            Loading profile...
          </p>
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  className="mb-2 block text-sm font-semibold"
                  htmlFor="display_name"
                >
                  Display Name
                </label>
                <input
                  id="display_name"
                  type="text"
                  value={profile.display_name}
                  onChange={handleFieldChange("display_name")}
                  className="w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3 text-sm outline-none ring-cyan-300/60 transition focus:ring-2"
                  placeholder="How your name appears"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-semibold" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={profile.email}
                  onChange={handleFieldChange("email")}
                  className="w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3 text-sm outline-none ring-cyan-300/60 transition focus:ring-2"
                  placeholder="you@example.com"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  className="mb-2 block text-sm font-semibold"
                  htmlFor="phone_number"
                >
                  Phone Number
                </label>
                <input
                  id="phone_number"
                  type="tel"
                  value={profile.phone_number}
                  onChange={handleFieldChange("phone_number")}
                  className="w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3 text-sm outline-none ring-cyan-300/60 transition focus:ring-2"
                  placeholder="+1 555 555 5555"
                />
              </div>

              <div>
                <label
                  className="mb-2 block text-sm font-semibold"
                  htmlFor="home_location"
                >
                  Home Location
                </label>
                <input
                  id="home_location"
                  type="text"
                  value={profile.home_location}
                  onChange={handleFieldChange("home_location")}
                  className="w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3 text-sm outline-none ring-cyan-300/60 transition focus:ring-2"
                  placeholder="Address or place label"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveMapPicker("home")}
                    className="rounded-full border border-cyan-200/60 bg-cyan-300/20 px-4 py-2 text-xs font-semibold transition hover:bg-cyan-300/30"
                  >
                    Pick on Map
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setProfile((previous) => ({
                        ...previous,
                        home_lat: "",
                        home_lng: "",
                      }))
                    }
                    className="rounded-full border border-white/40 px-4 py-2 text-xs font-semibold transition hover:bg-white/10"
                  >
                    Clear Pin
                  </button>
                </div>
                {profile.home_lat && profile.home_lng ? (
                  <p className="mt-2 text-xs text-cyan-200">
                    Pinned: {profile.home_lat}, {profile.home_lng}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  className="mb-2 block text-sm font-semibold"
                  htmlFor="work_location"
                >
                  Work Location
                </label>
                <input
                  id="work_location"
                  type="text"
                  value={profile.work_location}
                  onChange={handleFieldChange("work_location")}
                  className="w-full rounded-xl border border-white/30 bg-black/20 px-4 py-3 text-sm outline-none ring-cyan-300/60 transition focus:ring-2"
                  placeholder="Address or place label"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveMapPicker("work")}
                    className="rounded-full border border-cyan-200/60 bg-cyan-300/20 px-4 py-2 text-xs font-semibold transition hover:bg-cyan-300/30"
                  >
                    Pick on Map
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setProfile((previous) => ({
                        ...previous,
                        work_lat: "",
                        work_lng: "",
                      }))
                    }
                    className="rounded-full border border-white/40 px-4 py-2 text-xs font-semibold transition hover:bg-white/10"
                  >
                    Clear Pin
                  </button>
                </div>
                {profile.work_lat && profile.work_lng ? (
                  <p className="mt-2 text-xs text-cyan-200">
                    Pinned: {profile.work_lat}, {profile.work_lng}
                  </p>
                ) : null}
              </div>
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
              disabled={isSaving}
              className="w-full rounded-xl border border-cyan-100/50 bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
            >
              {isSaving ? "Saving..." : "Save Profile"}
            </button>
          </form>
        )}
      </main>

      {activeMapPicker === "home" ? (
        <InteractiveLocationMap
          isOpen
          title="Pick Home Location"
          initialLat={profile.home_lat ? Number(profile.home_lat) : null}
          initialLng={profile.home_lng ? Number(profile.home_lng) : null}
          onCancel={() => setActiveMapPicker(null)}
          onConfirm={(point, address) =>
            handleMapConfirm("home", point.lat, point.lng, address)
          }
        />
      ) : null}
      {activeMapPicker === "work" ? (
        <InteractiveLocationMap
          isOpen
          title="Pick Work Location"
          initialLat={profile.work_lat ? Number(profile.work_lat) : null}
          initialLng={profile.work_lng ? Number(profile.work_lng) : null}
          onCancel={() => setActiveMapPicker(null)}
          onConfirm={(point, address) =>
            handleMapConfirm("work", point.lat, point.lng, address)
          }
        />
      ) : null}
    </div>
  );
}
