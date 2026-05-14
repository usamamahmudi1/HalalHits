"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map,
  Pin,
  useAdvancedMarkerRef,
} from "@vis.gl/react-google-maps";
import { supabase } from "@/lib/supabase";

type Place = {
  id: string;
  name: string;
  category: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  verified: boolean;
  created_at: string;
  opens_at?: string | null;
  closes_at?: string | null;
  opening_hours_text?: string | null;
  confirmation_count?: number;
  confirmed_by?: string[];
};

type Filter = "all" | "restaurants" | "grocery" | "mosque";
type ViewMode = "list" | "map";
type UserLocation = { lat: number; lng: number } | null;

const STOCKHOLM = { lat: 59.3293, lng: 18.0686 };
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID";
const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim() ?? "";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "restaurants", label: "Restaurants" },
  { id: "grocery", label: "Grocery" },
  { id: "mosque", label: "Mosque" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("halalhits_device_id");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("halalhits_device_id", id);
  }
  return id;
}

function distanceKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km: number): string {
  const miles = km * 0.621371;
  if (km < 1) return `${Math.round(km * 1000)} m · ${(miles * 1000).toFixed(0)} ft`;
  return `${km.toFixed(1)} km · ${miles.toFixed(1)} mi`;
}

function getTrustTier(place: Place): "verified" | "community" | "unconfirmed" {
  if (place.verified) return "verified";
  if ((place.confirmation_count ?? 0) >= 3) return "community";
  return "unconfirmed";
}

function matchesFilter(category: string, filter: Filter): boolean {
  const c = category.toLowerCase().trim();
  if (filter === "all") return true;
  if (filter === "restaurants") return c.includes("restaurant");
  if (filter === "grocery") return c.includes("grocery");
  if (filter === "mosque") return c.includes("mosque");
  return true;
}

function hasCoords(p: Place): p is Place & { lat: number; lng: number } {
  return p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

function googleMapsUrl(place: Place & { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-current/20 text-[9px] font-bold leading-none"
        aria-label="More info"
      >i</button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-1.5 w-56 -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-2.5 text-left text-xs font-normal leading-relaxed text-gray-700 shadow-lg">
          {text}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            className="mt-1.5 block text-xs font-semibold text-emerald-600"
          >Got it</button>
        </span>
      )}
    </span>
  );
}

function TrustBadge({ place }: { place: Place }) {
  const tier = getTrustTier(place);
  const count = place.confirmation_count ?? 0;

  if (tier === "verified") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
      </svg>
      Verified
    </span>
  );

  if (tier === "community") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
      </svg>
      {count} confirmed
      <InfoTooltip text="Confirmed halal by the community. 3+ confirmations = community trusted. Admin verification is the highest level." />
    </span>
  );

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      Needs confirmation
      {count > 0 && <span className="ml-0.5">· {count}</span>}
      <InfoTooltip text="Submitted by a community member but not yet confirmed. Tap 'I confirm this is halal' to help verify it." />
    </span>
  );
}

function MapsButton({ place }: { place: Place }) {
  if (!hasCoords(place)) return null;
  return (
    
      href={googleMapsUrl(place)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-600 shadow-sm transition hover:bg-red-50"
      aria-label={`Open ${place.name} in Google Maps`}
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden>
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
      </svg>
      Maps
    </a>
  );
}

function ConfirmButton({ place, onConfirmed }: { place: Place; onConfirmed: (id: string) => void }) {
  const deviceId = getDeviceId();
  const alreadyVoted = (place.confirmed_by ?? []).includes(deviceId);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(alreadyVoted);

  if (getTrustTier(place) === "verified") return null;

  async function confirm() {
    if (done || busy) return;
    setBusy(true);
    const { error } = await supabase.from("places").update({
      confirmation_count: (place.confirmation_count ?? 0) + 1,
      confirmed_by: [...(place.confirmed_by ?? []), deviceId],
    }).eq("id", place.id);
    setBusy(false);
    if (!error) { setDone(true); onConfirmed(place.id); }
  }

  return (
    <button
      type="button"
      onClick={() => void confirm()}
      disabled={busy || done}
      className={done
        ? "mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"
        : "mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50 disabled:opacity-50"
      }
    >
      {done ? (
        <>
          <svg className="h-3.5 w-3.5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          You confirmed this
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M1 8.25a1.25 1.25 0 112.5 0v7.5a1.25 1.25 0 11-2.5 0v-7.5zM11 3V1.7c0-.268.14-.526.395-.607A2 2 0 0114 3c0 .995-.182 1.948-.514 2.826-.204.54.166 1.174.744 1.174h2.52c1.243 0 2.261 1.01 2.146 2.247a23.864 23.864 0 01-1.341 5.974C17.153 16.323 16.072 17 14.9 17H8c-.71 0-1.4-.185-1.985-.542A5.456 5.456 0 015 12.75V10.5a2 2 0 012-2h.093A2.75 2.75 0 009.75 6.25V5c0-1.105.895-2 2-2z" />
          </svg>
          {busy ? "Confirming…" : "I confirm this is halal"}
        </>
      )}
    </button>
  );
}

function UserDot({ position }: { position: { lat: number; lng: number } }) {
  return (
    <AdvancedMarker position={position} title="Your location">
      <div className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
        <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-blue-600 ring-2 ring-white" />
      </div>
    </AdvancedMarker>
  );
}

function PlaceMarker({
  place, selected, onSelect, onConfirmed, userLocation,
}: {
  place: Place & { lat: number; lng: number };
  selected: boolean;
  onSelect: (id: string | null) => void;
  onConfirmed: (id: string) => void;
  userLocation: UserLocation;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const tier = getTrustTier(place);
  const pinColor = tier === "verified" ? "#16a34a" : tier === "community" ? "#2563eb" : "#d97706";
  const pinBorder = tier === "verified" ? "#15803d" : tier === "community" ? "#1d4ed8" : "#b45309";
  const dist = userLocation
    ? distanceKm(userLocation.lat, userLocation.lng, place.lat, place.lng)
    : null;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: place.lat, lng: place.lng }}
        title={place.name}
        onClick={() => onSelect(place.id)}
      >
        <Pin background={pinColor} borderColor={pinBorder} glyphColor="#ffffff" />
      </AdvancedMarker>
      {selected && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => onSelect(null)}>
          <div className="max-w-[240px] space-y-1.5 p-1">
            <p className="font-semibold text-emerald-950">{place.name}</p>
            <TrustBadge place={place} />
            <p className="text-xs text-neutral-600">{place.address}</p>
            {dist !== null && (
              <p className="text-xs font-medium text-blue-700">
                📍 {formatDistance(dist)}
              </p>
            )}
            <div className="pt-1">
              <MapsButton place={place} />
            </div>
            <ConfirmButton place={place} onConfirmed={onConfirmed} />
          </div>
        </InfoWindow>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "denied" | "ok">("idle");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("places")
        .select("*")
        .order("name", { ascending: true });
      if (cancelled) return;
      if (fetchError) { setError(fetchError.message); setPlaces([]); }
      else setPlaces((data as Place[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationStatus("ok");
      },
      () => setLocationStatus("denied"),
      { timeout: 8000 },
    );
  }, []);

  function handleConfirmed(id: string) {
    setPlaces((prev) => prev.map((p) =>
      p.id === id
        ? { ...p, confirmation_count: (p.confirmation_count ?? 0) + 1, confirmed_by: [...(p.confirmed_by ?? []), getDeviceId()] }
        : p
    ));
  }

  const filtered = useMemo(
    () => places.filter((p) => matchesFilter(p.category, filter)),
    [places, filter],
  );

  const sortedFiltered = useMemo(() => {
    if (!userLocation) return filtered;
    return [...filtered].sort((a, b) => {
      const aDist = hasCoords(a) ? distanceKm(userLocation.lat, userLocation.lng, a.lat, a.lng) : Infinity;
      const bDist = hasCoords(b) ? distanceKm(userLocation.lat, userLocation.lng, b.lat, b.lng) : Infinity;
      return aDist - bDist;
    });
  }, [filtered, userLocation]);

  const mappable = useMemo(() => sortedFiltered.filter(hasCoords), [sortedFiltered]);

  useEffect(() => { setSelectedMarkerId(null); }, [filter]);
  useEffect(() => { if (view !== "map") setSelectedMarkerId(null); }, [view]);

  const mapCenter = userLocation ?? STOCKHOLM;

  return (
    <div className="min-h-dvh bg-emerald-50 text-emerald-950">
      <header className="sticky top-0 z-20 border-b border-emerald-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:py-5">
          <h1 className="text-xl font-bold tracking-tight text-emerald-800 sm:text-2xl">
            HalalHits 🕌
          </h1>
          <div className="flex items-center gap-2">
            {locationStatus === "loading" && (
              <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                Locating…
              </span>
            )}
            {locationStatus === "ok" && (
              <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Near you
              </span>
            )}
            {locationStatus === "denied" && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500">
                📍 Location off
              </span>
            )}
            <div className="flex rounded-full border border-emerald-200 bg-emerald-50/80 p-1 shadow-sm" role="group">
              {(["map", "list"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={v === view
                    ? "rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm capitalize"
                    : "rounded-full px-4 py-2 text-sm font-medium text-emerald-700 transition hover:text-emerald-900 capitalize"
                  }
                >{v}</button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4 sm:pt-6">

        {/* Trust legend */}
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-xs text-emerald-700 shadow-sm">
          <span className="font-semibold text-emerald-800">Trust:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">✓ Verified</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-800">👥 Community</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">⚠ Unconfirmed</span>
        </div>

        {/* Filters */}
        <div className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={filter === f.id
                ? "rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-2 ring-emerald-600 ring-offset-2 ring-offset-emerald-50"
                : "rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
              }
            >{f.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" aria-hidden />
            <p className="text-sm font-medium text-emerald-700">Loading places…</p>
          </div>
        ) : error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800">{error}</p>
        ) : view === "map" ? (
          !GOOGLE_MAPS_KEY ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-center text-sm text-amber-950">
              Add <code className="rounded bg-amber-100/80 px-1 text-xs">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> to .env.local
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm ring-1 ring-emerald-100/60">
              <APIProvider apiKey={GOOGLE_MAPS_KEY} libraries={["marker"]}>
                <Map
                  mapId={MAP_ID}
                  defaultCenter={mapCenter}
                  defaultZoom={userLocation ? 13 : 11}
                  gestureHandling="greedy"
                  className="h-[min(70dvh,520px)] w-full sm:h-[480px]"
                >
                  {userLocation && <UserDot position={userLocation} />}
                  {mappable.map((place) => (
                    <PlaceMarker
                      key={place.id}
                      place={place}
                      selected={selectedMarkerId === place.id}
                      onSelect={setSelectedMarkerId}
                      onConfirmed={handleConfirmed}
                      userLocation={userLocation}
                    />
                  ))}
                </Map>
              </APIProvider>
            </div>
          )
        ) : sortedFiltered.length === 0 ? (
          <p className="rounded-xl border border-emerald-200 bg-white px-4 py-8 text-center text-sm text-emerald-700">
            No places in this category yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sortedFiltered.map((place) => {
              const dist = (userLocation && hasCoords(place))
                ? distanceKm(userLocation.lat, userLocation.lng, place.lat, place.lng)
                : null;
              return (
                <li key={place.id}>
                  <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm ring-1 ring-emerald-100/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-lg font-semibold text-emerald-900">
                          {place.name}
                        </h2>
                        <p className="mt-1 text-sm text-emerald-700/90">{place.city}</p>
                        {dist !== null && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-blue-700">
                            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
                            </svg>
                            {formatDistance(dist)}
                          </p>
                        )}
                        {place.opens_at && place.closes_at && (
                          <p className="mt-1 text-xs font-medium text-emerald-700">
                            {place.opens_at} – {place.closes_at}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <TrustBadge place={place} />
                          <MapsButton place={place} />
                        </div>
                        <ConfirmButton place={place} onConfirmed={handleConfirmed} />
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                        {place.category}
                      </span>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <Link
        href="/submit"
        className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg ring-2 ring-white/90 transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/70"
        aria-label="Submit a place"
      >
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
    </div>
  );
}