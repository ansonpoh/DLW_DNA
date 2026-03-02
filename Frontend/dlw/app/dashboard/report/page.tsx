"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { useEffect, useMemo, useRef, useState } from "react";
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

type AiGuidance = {
  used_ai: boolean;
  summary: string;
  validation_notes: string;
  safe_to_continue: boolean;
  reassurance_message: string;
  next_steps: string[];
};

type MediaAnalysis = {
  message: string;
  incident_type: string;
  confidence: number;
  model_backend: string;
  frames_analyzed: number;
  event_forwarded: boolean;
  server_status: number | null;
  metadata?: Record<string, unknown>;
};

type TranscriptionPreview = {
  text: string;
  language: string;
  language_probability: number;
  duration_seconds: number;
  model: string;
};

const incidentTypeToReportType: Record<string, string> = {
  traffic_accident: "Accident/Traffic",
  pedestrian_vehicle_conflict: "Accident/Traffic",
  crowd_disturbance: "Violence/Fight",
  vehicle_stoppage_or_breakdown: "Accident/Traffic",
};

const recordingMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

const pickRecordingMimeType = () => {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return "";
  }
  const supported = recordingMimeTypes.find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  );
  return supported || "";
};

const extensionForMimeType = (mimeType: string) => {
  if (mimeType.includes("ogg")) {
    return "ogg";
  }
  if (mimeType.includes("mp4")) {
    return "m4a";
  }
  return "webm";
};

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
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState("");
  const [recorderError, setRecorderError] = useState("");
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isRecorderReady, setIsRecorderReady] = useState(false);
  const [isAnalyzingMedia, setIsAnalyzingMedia] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [mediaAnalysis, setMediaAnalysis] = useState<MediaAnalysis | null>(null);
  const [aiGuidance, setAiGuidance] = useState<AiGuidance | null>(null);
  const [transcriptionPreview, setTranscriptionPreview] =
    useState<TranscriptionPreview | null>(null);
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  const supportsAudioRecording = isRecorderReady;

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

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices !== "undefined" &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      typeof MediaRecorder !== "undefined";
    setIsRecorderReady(supported);
  }, []);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current !== null) {
        window.clearInterval(recordingTimerRef.current);
      }
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
      }
    };
  }, [recordedAudioUrl]);

  const clearRecorderResources = () => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    setIsRecordingAudio(false);
  };

  const stopAudioRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      return;
    }
    recorder.stop();
  };

  const startAudioRecording = async () => {
    if (!supportsAudioRecording) {
      setRecorderError("Audio recording is not supported in this browser.");
      return;
    }

    try {
      setRecorderError("");
      setSubmitError("");
      setTranscriptionPreview(null);
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
        setRecordedAudioUrl("");
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(mediaStream, { mimeType })
        : new MediaRecorder(mediaStream);

      mediaStreamRef.current = mediaStream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      setRecordingSeconds(0);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const activeMimeType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: activeMimeType });
        if (blob.size <= 0) {
          setRecorderError("No audio captured. Please try recording again.");
          clearRecorderResources();
          return;
        }

        const extension = extensionForMimeType(activeMimeType);
        const filename = `voice-note-${Date.now()}.${extension}`;
        const file = new File([blob], filename, { type: activeMimeType });
        const objectUrl = URL.createObjectURL(blob);
        setAudioFile(file);
        setRecordedAudioUrl(objectUrl);
        clearRecorderResources();
      };

      recorder.onerror = () => {
        setRecorderError("Recording failed. Please retry.");
        clearRecorderResources();
      };

      recorder.start(250);
      setIsRecordingAudio(true);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => current + 1);
      }, 1000);
    } catch {
      setRecorderError(
        "Microphone access failed. Allow microphone permission and use HTTPS or localhost.",
      );
      clearRecorderResources();
    }
  };

  const removeAttachedAudio = () => {
    if (isRecordingAudio) {
      stopAudioRecording();
    }
    setAudioFile(null);
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
      setRecordedAudioUrl("");
    }
  };

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
    setAiGuidance(null);
    setTranscriptionPreview(null);

    const hasAudio = Boolean(audioFile);
    if (isRecordingAudio) {
      setSubmitError("Stop recording before submitting the report.");
      return;
    }
    if (!hasAudio && !description.trim()) {
      setSubmitError("Please describe what happened or attach an audio clip.");
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
      let data: any;
      if (hasAudio && audioFile) {
        const form = new FormData();
        form.set("audio", audioFile);
        form.set("type", selectedType);
        form.set("happening_now", String(happeningNow));
        form.set("safe_to_continue", String(safeToContinue));
        form.set("location_label", locationLabel);
        form.set("latitude", selectedLocation.lat === null ? "" : String(selectedLocation.lat));
        form.set("longitude", selectedLocation.lng === null ? "" : String(selectedLocation.lng));
        form.set("priority", estimatedPriority);
        form.set("source_id", "FRONTEND-AUDIO-UPLOAD");

        const response = await fetch(`${api.defaults.baseURL}/api/reports/audio`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: form,
        });

        data = await response.json();
        if (!response.ok) {
          throw new Error(String((data as { message?: string })?.message || ""));
        }
      } else {
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

        const response = await api.post("/api/reports", payload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        data = response.data;
      }

      const guidanceSource = data?.ai_guidance;
      if (guidanceSource && typeof guidanceSource === "object") {
        const parsedSteps = Array.isArray(guidanceSource.next_steps)
          ? guidanceSource.next_steps
              .map((step: unknown) => String(step || "").trim())
              .filter((step: string) => step.length > 0)
          : [];

        setAiGuidance({
          used_ai: Boolean(guidanceSource.used_ai),
          summary: String(guidanceSource.summary || "").trim(),
          validation_notes: String(guidanceSource.validation_notes || "").trim(),
          safe_to_continue: Boolean(guidanceSource.safe_to_continue),
          reassurance_message: String(guidanceSource.reassurance_message || "").trim(),
          next_steps: parsedSteps,
        });
      }
      const transcriptionSource = data?.transcription;
      if (transcriptionSource?.text) {
        setTranscriptionPreview({
          text: String(transcriptionSource.text || "").trim(),
          language: String(transcriptionSource.language || "").trim(),
          language_probability: Number(transcriptionSource.language_probability || 0),
          duration_seconds: Number(transcriptionSource.duration_seconds || 0),
          model: String(transcriptionSource.model || "").trim(),
        });
      }

      setSubmitted(true);
      setDescription("");
      setAudioFile(null);
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
        setRecordedAudioUrl("");
      }
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      const apiMessage = axiosError.response?.data?.message || (err instanceof Error ? err.message : "");
      setSubmitError(apiMessage || "Unable to submit report right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnalyzeMedia = async () => {
    setMediaError("");
    setMediaAnalysis(null);

    if (!mediaFile) {
      setMediaError("Please attach an image or video first.");
      return;
    }

    setIsAnalyzingMedia(true);
    try {
      const form = new FormData();
      form.set("media", mediaFile);
      form.set("forward_event", "false");
      form.set("source_id", "USER-UPLOAD");

      const locationLabel = selectedLocation.label.trim() || manualLocationInput.trim();
      if (locationLabel) {
        form.set("location_label", locationLabel);
      }
      if (selectedLocation.lat !== null) {
        form.set("latitude", String(selectedLocation.lat));
      }
      if (selectedLocation.lng !== null) {
        form.set("longitude", String(selectedLocation.lng));
      }

      const response = await fetch("/api/detection/analyze-media", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as MediaAnalysis | { message?: string };
      if (!response.ok) {
        throw new Error(String((data as { message?: string }).message || ""));
      }

      setMediaAnalysis(data as MediaAnalysis);

      const mappedType = incidentTypeToReportType[String((data as MediaAnalysis).incident_type || "")];
      if (mappedType) {
        setSelectedType(mappedType);
      }

      setDescription(
        `Model-inferred incident: ${(data as MediaAnalysis).incident_type} (confidence ${Number((data as MediaAnalysis).confidence || 0).toFixed(2)}).`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setMediaError(message || "Unable to analyze uploaded media right now.");
    } finally {
      setIsAnalyzingMedia(false);
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
                placeholder="Describe what is happening (optional if audio is attached)"
                className="mt-3 min-h-28 w-full rounded-lg border border-white/25 bg-white/5 p-3 text-sm text-slate-100 outline-none ring-teal-300/60 transition focus:ring-2"
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-teal-200/35 bg-teal-200/10 p-3 text-sm text-teal-50">
                  <p className="font-semibold text-teal-100">Optional: Upload voice note (STT)</p>
                  <input
                    id="voice-note-upload"
                    type="file"
                    accept="audio/*"
                    onChange={(event) => {
                      const chosen = event.target.files?.[0] || null;
                      setAudioFile(chosen);
                      if (recordedAudioUrl) {
                        URL.revokeObjectURL(recordedAudioUrl);
                        setRecordedAudioUrl("");
                      }
                      setSubmitError("");
                    }}
                    className="hidden"
                  />
                  <label
                    htmlFor="voice-note-upload"
                    className="mt-2 inline-flex cursor-pointer rounded-full border border-teal-100/50 bg-teal-300/25 px-3 py-1 text-xs font-semibold text-teal-50 transition hover:bg-teal-300/35"
                  >
                    Choose audio file
                  </label>
                  <p className="mt-2 text-xs text-teal-100/90">
                    If attached, this report is transcribed by AI and you will see transcript confirmation after submit.
                  </p>
                  <div className="mt-3 rounded-lg border border-teal-200/35 bg-teal-100/10 p-3">
                    <p className="text-xs font-semibold text-teal-100">
                      Or record directly in browser
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void startAudioRecording()}
                        disabled={isRecordingAudio || !supportsAudioRecording}
                        className="rounded-full border border-teal-100/50 bg-teal-300/25 px-3 py-1 text-xs font-semibold text-teal-50 transition hover:bg-teal-300/35 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isRecordingAudio ? "Recording..." : "Start recording"}
                      </button>
                      <button
                        type="button"
                        onClick={stopAudioRecording}
                        disabled={!isRecordingAudio}
                        className="rounded-full border border-amber-100/45 bg-amber-300/20 px-3 py-1 text-xs font-semibold text-amber-50 transition hover:bg-amber-300/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Stop
                      </button>
                      {isRecordingAudio ? (
                        <span className="text-xs text-teal-100/90">
                          {`Rec ${Math.floor(recordingSeconds / 60)
                            .toString()
                            .padStart(2, "0")}:${(recordingSeconds % 60)
                            .toString()
                            .padStart(2, "0")}`}
                        </span>
                      ) : null}
                    </div>
                    {recordedAudioUrl ? (
                      <div className="mt-2 space-y-2">
                        <audio controls src={recordedAudioUrl} className="w-full" />
                        <button
                          type="button"
                          onClick={removeAttachedAudio}
                          className="rounded-full border border-white/35 px-3 py-1 text-xs text-slate-100 transition hover:bg-white/10"
                        >
                          Remove audio
                        </button>
                      </div>
                    ) : null}
                    {recorderError ? (
                      <p className="mt-2 rounded-md border border-rose-200/40 bg-rose-400/20 p-2 text-xs text-rose-50">
                        {recorderError}
                      </p>
                    ) : null}
                  </div>
                </div>
                <label className="rounded-lg border border-white/20 bg-white/5 p-3 text-sm text-slate-200">
                  Optional: Upload image/video for AI incident detection
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={(event) => {
                      const chosen = event.target.files?.[0] || null;
                      setMediaFile(chosen);
                      setMediaAnalysis(null);
                      setMediaError("");
                    }}
                    className="mt-2 block w-full text-xs"
                  />
                </label>
                <div className="rounded-lg border border-white/20 bg-white/5 p-3 text-sm text-slate-200">
                  <p className="font-semibold text-slate-100">Run media analysis</p>
                  <button
                    type="button"
                    onClick={handleAnalyzeMedia}
                    disabled={isAnalyzingMedia}
                    className="mt-3 rounded-full border border-cyan-200/60 bg-cyan-300/20 px-4 py-2 text-xs font-semibold transition hover:bg-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isAnalyzingMedia ? "Analyzing..." : "Analyze uploaded media"}
                  </button>
                </div>
              </div>
              {audioFile ? (
                <div className="mt-3 rounded-lg border border-teal-200/40 bg-teal-200/10 p-3 text-xs text-teal-50">
                  Voice note ready: <span className="font-semibold">{audioFile.name}</span>
                </div>
              ) : null}
              {mediaError ? (
                <p className="mt-3 rounded-lg border border-rose-200/40 bg-rose-400/20 p-3 text-sm text-rose-50">
                  {mediaError}
                </p>
              ) : null}
              {mediaAnalysis ? (
                <div className="mt-3 rounded-lg border border-cyan-200/40 bg-cyan-200/10 p-3 text-xs text-cyan-50">
                  <p className="font-semibold text-cyan-100">Media analysis result</p>
                  <p className="mt-1">
                    Incident: <span className="font-semibold">{mediaAnalysis.incident_type}</span>
                    {" | "}Confidence: {Number(mediaAnalysis.confidence || 0).toFixed(2)}
                    {" | "}Frames analyzed: {mediaAnalysis.frames_analyzed}
                  </p>
                  <p className="mt-1">
                    Backend: {mediaAnalysis.model_backend}
                    {" | "}Forwarded: {mediaAnalysis.event_forwarded ? "Yes" : "No"}
                  </p>
                </div>
              ) : null}
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
                  Move to safety first. If immediate danger exists, call 999 for
                  police threats or 995 for medical/fire emergencies.
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
                  {aiGuidance ? (
                    <div className="rounded-lg border border-emerald-100/40 bg-emerald-100/15 p-3 text-emerald-50">
                      <p className="font-semibold">Recommended next steps</p>
                      {aiGuidance.reassurance_message ? (
                        <p className="mt-2 rounded-md border border-emerald-200/40 bg-emerald-200/15 p-2 text-xs text-emerald-50">
                          {aiGuidance.reassurance_message}
                        </p>
                      ) : null}
                      {aiGuidance.summary ? (
                        <p className="mt-1 text-xs text-emerald-100/90">
                          Summary: {aiGuidance.summary}
                        </p>
                      ) : null}
                      {!aiGuidance.safe_to_continue ? (
                        <p className="mt-2 rounded-md border border-rose-200/40 bg-rose-400/20 p-2 text-xs text-rose-50">
                          Immediate risk detected. Move to safety and call 999 for
                          police threats or 995 for medical/fire emergencies.
                        </p>
                      ) : null}
                      {aiGuidance.next_steps.length ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-emerald-50">
                          {aiGuidance.next_steps.map((step, index) => (
                            <li key={`${index}-${step}`}>{step}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  {transcriptionPreview ? (
                    <div className="rounded-lg border border-teal-100/40 bg-teal-200/15 p-3 text-teal-50">
                      <p className="font-semibold">Transcription confirmation</p>
                      <p className="mt-2 rounded-md border border-teal-200/35 bg-teal-100/10 p-2 text-xs text-teal-50">
                        "{transcriptionPreview.text}"
                      </p>
                      <p className="mt-2 text-xs text-teal-100/90">
                        Language: {transcriptionPreview.language || "unknown"}
                        {" | "}Confidence: {transcriptionPreview.language_probability.toFixed(2)}
                        {" | "}Duration: {transcriptionPreview.duration_seconds.toFixed(1)}s
                        {" | "}Model: {transcriptionPreview.model || "-"}
                      </p>
                    </div>
                  ) : null}
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

