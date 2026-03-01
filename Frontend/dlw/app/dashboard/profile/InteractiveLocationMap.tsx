"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SelectedPoint = {
  lat: number;
  lng: number;
};

type InteractiveLocationMapProps = {
  isOpen: boolean;
  title: string;
  initialLat: number | null;
  initialLng: number | null;
  onCancel: () => void;
  onConfirm: (point: SelectedPoint, address: string) => void;
};

const LEAFLET_SCRIPT_ID = "leaflet-script";
const LEAFLET_STYLES_ID = "leaflet-styles";
const DEFAULT_CENTER: SelectedPoint = { lat: 1.3521, lng: 103.8198 };

type LeafletClickEvent = {
  latlng: {
    lat: number;
    lng: number;
  };
};

type LeafletMap = {
  setView: (coords: [number, number], zoom?: number) => LeafletMap;
  on: (eventName: string, callback: (event: LeafletClickEvent) => void) => void;
  remove: () => void;
  invalidateSize: () => void;
};

type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  setLatLng: (coords: [number, number]) => void;
};

type LeafletNamespace = {
  map: (container: HTMLElement) => LeafletMap;
  tileLayer: (
    urlTemplate: string,
    options: { attribution: string },
  ) => { addTo: (map: LeafletMap) => void };
  marker: (coords: [number, number]) => LeafletMarker;
};

declare global {
  interface Window {
    L?: LeafletNamespace;
  }
}

function ensureLeafletLoaded() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Map can only load in browser."));
      return;
    }

    if (window.L) {
      resolve();
      return;
    }

    if (!document.getElementById(LEAFLET_STYLES_ID)) {
      const styleTag = document.createElement("link");
      styleTag.id = LEAFLET_STYLES_ID;
      styleTag.rel = "stylesheet";
      styleTag.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(styleTag);
    }

    const existingScript = document.getElementById(LEAFLET_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Unable to load map library.")),
        { once: true },
      );
      return;
    }

    const scriptTag = document.createElement("script");
    scriptTag.id = LEAFLET_SCRIPT_ID;
    scriptTag.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    scriptTag.async = true;
    scriptTag.onload = () => resolve();
    scriptTag.onerror = () => reject(new Error("Unable to load map library."));
    document.body.appendChild(scriptTag);
  });
}

async function reverseGeocode(point: SelectedPoint) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      point.lat,
    )}&lon=${encodeURIComponent(point.lng)}`,
    {
      headers: {
        "Accept-Language": "en",
      },
    },
  );

  if (!response.ok) {
    throw new Error("Reverse geocoding failed.");
  }

  const data = (await response.json()) as { display_name?: string };
  return String(data.display_name || "").trim();
}

type SearchResult = {
  display_name: string;
  lat: string;
  lon: string;
};

async function searchLocations(query: string) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      query,
    )}&limit=5`,
    {
      headers: {
        "Accept-Language": "en",
      },
    },
  );

  if (!response.ok) {
    throw new Error("Location search failed.");
  }

  const data = (await response.json()) as SearchResult[];
  return data;
}

export default function InteractiveLocationMap({
  isOpen,
  title,
  initialLat,
  initialLng,
  onCancel,
  onConfirm,
}: InteractiveLocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState("");
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const startPoint = useMemo(
    () =>
      initialLat !== null && initialLng !== null
        ? { lat: initialLat, lng: initialLng }
        : DEFAULT_CENTER,
    [initialLat, initialLng],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void ensureLeafletLoaded()
      .then(() => setIsReady(true))
      .catch((loadError) => {
        const message =
          loadError instanceof Error ? loadError.message : "Unable to load map.";
        setError(message);
      });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isReady || !mapContainerRef.current || !window.L) {
      return;
    }

    const L = window.L;
    if (!L) {
      return;
    }

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView(
        [startPoint.lat, startPoint.lng],
        13,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(mapRef.current);

      mapRef.current.on("click", (event: LeafletClickEvent) => {
        const lat = Number(event.latlng.lat.toFixed(6));
        const lng = Number(event.latlng.lng.toFixed(6));
        setSelectedPoint({ lat, lng });
        setError("");
      });
    }

    const activePoint = selectedPoint || startPoint;
    mapRef.current.setView([activePoint.lat, activePoint.lng], 15);

    if (!markerRef.current) {
      markerRef.current = L.marker([activePoint.lat, activePoint.lng]).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng([activePoint.lat, activePoint.lng]);
    }

    window.setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 50);
  }, [isOpen, isReady, selectedPoint, startPoint]);

  useEffect(() => {
    if (!selectedPoint) {
      return;
    }

    let isCancelled = false;

    void reverseGeocode(selectedPoint)
      .then((address) => {
        if (!isCancelled) {
          setSelectedAddress(address);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setSelectedAddress("");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedPoint]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
    };
  }, []);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        setSelectedPoint({ lat, lng });
        setError("");
      },
      () => {
        setError("Unable to access current location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      },
    );
  };

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError("");
    try {
      const results = await searchLocations(query);
      setSearchResults(results);
      if (!results.length) {
        setError("No matching places found.");
      }
    } catch {
      setError("Unable to search locations right now.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (result: SearchResult) => {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError("Selected place has invalid coordinates.");
      return;
    }

    setSelectedPoint({
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    });
    setSelectedAddress(result.display_name);
    setSearchResults([]);
    setError("");
  };

  if (!isOpen) {
    return null;
  }

  const pointToConfirm = selectedPoint || startPoint;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-3xl rounded-2xl border border-white/20 bg-slate-950/95 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-white">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/40 px-4 py-1 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
          >
            Close
          </button>
        </div>

        {error ? (
          <p className="mb-3 rounded-lg border border-rose-300/40 bg-rose-400/15 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        <form className="mb-3" onSubmit={handleSearch}>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-xl border border-white/30 bg-black/20 px-4 py-2 text-sm text-slate-100 outline-none ring-cyan-300/60 transition focus:ring-2"
              placeholder="Search place or address"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="rounded-xl border border-cyan-200/60 bg-cyan-300/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-cyan-300/30 disabled:opacity-60"
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>
        </form>

        {searchResults.length ? (
          <div className="mb-3 max-h-40 overflow-y-auto rounded-xl border border-white/20 bg-black/25 p-1">
            {searchResults.map((result) => (
              <button
                key={`${result.lat}-${result.lon}-${result.display_name}`}
                type="button"
                onClick={() => handleSelectSearchResult(result)}
                className="block w-full rounded-lg px-3 py-2 text-left text-xs text-slate-100 transition hover:bg-white/10"
              >
                {result.display_name}
              </button>
            ))}
          </div>
        ) : null}

        <div ref={mapContainerRef} className="h-[420px] w-full rounded-xl border border-white/20" />

        <p className="mt-3 text-sm text-slate-200">
          Selected: {pointToConfirm.lat.toFixed(6)}, {pointToConfirm.lng.toFixed(6)}
        </p>
        {selectedAddress ? (
          <p className="mt-2 text-xs text-cyan-100">Address: {selectedAddress}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            className="rounded-full border border-cyan-200/60 bg-cyan-300/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-cyan-300/30"
          >
            Use Current Position
          </button>
          <button
            type="button"
            onClick={() => onConfirm(pointToConfirm, selectedAddress)}
            className="rounded-full border border-emerald-200/60 bg-emerald-300/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-300/30"
          >
            Confirm Location
          </button>
        </div>
      </div>
    </div>
  );
}
