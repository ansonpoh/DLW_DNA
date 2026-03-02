import { NextResponse } from "next/server";

const DETECTION_BASE_URL =
  process.env.DETECTION_SERVICE_BASE_URL || "http://127.0.0.1:3011";
const DETECTION_INGEST_KEY = process.env.DETECTION_INGEST_KEY || "";

export async function POST(request: Request) {
  try {
    if (!DETECTION_INGEST_KEY) {
      return NextResponse.json(
        { message: "Detection ingest key is not configured on frontend server." },
        { status: 500 },
      );
    }

    const incoming = await request.formData();
    const media = incoming.get("media");

    const hasFileLikeShape =
      media !== null &&
      typeof media === "object" &&
      "arrayBuffer" in media &&
      "name" in media;

    if (!hasFileLikeShape) {
      return NextResponse.json(
        { message: "Missing media upload. Attach an image or video file." },
        { status: 400 },
      );
    }
    const mediaFile = media as File;

    const sourceIdRaw = String(incoming.get("source_id") || "USER-UPLOAD");
    const locationLabelRaw = String(incoming.get("location_label") || "");
    const latitudeRaw = String(incoming.get("latitude") || "");
    const longitudeRaw = String(incoming.get("longitude") || "");

    const outgoing = new FormData();
    outgoing.set("media", mediaFile, mediaFile.name || "upload.bin");
    outgoing.set("forward_event", "false");
    outgoing.set("source_id", sourceIdRaw.trim() || "USER-UPLOAD");

    if (locationLabelRaw.trim()) {
      outgoing.set("location_label", locationLabelRaw.trim());
    }
    if (latitudeRaw.trim()) {
      outgoing.set("latitude", latitudeRaw.trim());
    }
    if (longitudeRaw.trim()) {
      outgoing.set("longitude", longitudeRaw.trim());
    }

    const endpointPath = "/api/detection/analyze-media";
    let response: Response;
    try {
      response = await fetch(`${DETECTION_BASE_URL}${endpointPath}`, {
        method: "POST",
        headers: {
          "x-detection-key": DETECTION_INGEST_KEY,
        },
        body: outgoing,
        cache: "no-store",
      });
    } catch (primaryError) {
      if (!DETECTION_BASE_URL.includes("localhost")) {
        throw primaryError;
      }
      const ipv4Fallback = DETECTION_BASE_URL.replace("localhost", "127.0.0.1");
      response = await fetch(`${ipv4Fallback}${endpointPath}`, {
        method: "POST",
        headers: {
          "x-detection-key": DETECTION_INGEST_KEY,
        },
        body: outgoing,
        cache: "no-store",
      });
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "detail" in payload
          ? String((payload as { detail?: unknown }).detail || "")
          : "";
      return NextResponse.json(
        { message: message || "Detection service rejected media analysis request." },
        { status: response.status },
      );
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected proxy error.";
    return NextResponse.json(
      { message: `Unable to process media analysis request right now. ${message}` },
      { status: 500 },
    );
  }
}
