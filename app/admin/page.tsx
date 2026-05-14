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

const STOCKHOLM = { lat: 59.3293, lng: 18.0686 };
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID";
const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim() ?? "";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "restaurants", label: "Restaurants" },
  { id: "grocery", label: "Grocery" },
  { id: "mosque", label: "Mosque" },
];

function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("halalhits_device_id");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("halalhits_device_id", id);
  }
  return id;
}

function getTrustTier(place: Place): "verified" | "community" | "unconfirmed" {
  if (place.verified) return "verified";
  if ((place.confirmation_count ?? 0) >= 3) return "community";
  return "unconfirmed";
}

function TrustBadge({ place }: { place: Place }) {
  const tier = getTrustTier(place);
  const count = place.confirmation_count ?? 0;

  if (tier === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
        </svg>
        Verified
      </span>
    );
  }

  if (tier === "community") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
        </svg>
        {count} confirmed
        <InfoTooltip text="This place has been confirmed halal by the community. Higher confirmations = more trustworthy. Admin verification is the highest level of trust." />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      Needs confirmation
      {count > 0 && <span className="ml-0.5">· {count}</span>}
      <InfoTooltip text="This place was submitted by a community member but hasn't been confirmed yet. Tap 'I confirm this is halal' to help verify it." />
    </span>
  );
}

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-current/20 text-[9px] font-bold leading-none"
        aria-label="More info"
      >
        i
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-1.5 w-56 -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-2.5 text-left text-xs font-normal leading-relaxed text-gray-700 shadow-lg">
          {text}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            className="mt-1.5 block text-xs font-semibold text-emerald-600"
          >
            Got it
          </button>
        </span>
      )}
    </span>
  );
}

function ConfirmButton({ place, onConfirmed }: { place: Place; onConfirmed: (id: string) => void }) {
  const deviceId = getDeviceId();
  const alreadyVoted = (place.confirmed_by ?? []).includes(deviceId);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(alreadyVoted);
  const tier = getTrustTier(place);

  if (tier === "verified") return null;

  async function confirm() {
    if (done || busy) return;
    setBusy(true);
    const newCount = (place.confirmation_count ?? 0) + 1;
    const newConfirmedBy = [...(place.confirmed_by ?? []), deviceId];
    const { error } = await supabase
      .from("places")
      .update({
        confirmation_count: newCount,
        confirmed_by: newConfirmedBy,
      })
      .eq("id", place.id);
    setBusy(false);
    if (!error) {
      setDone(true);
      onConfirmed(place.id);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void confirm()}
      disabled={busy || done}
      className={
        done
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

function hasCoords(p: Place): p is Place & { lat: number; lng: number } {
  return p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

function PlaceMarker({ place, selected, onSelect, onConfirmed }: {
  place: Place & { lat: number; lng: number };
  selected: boolean;
  onSelect: (id: string | null) => void;
  onConfirmed: (id: string) => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const tier = getTrustTier(place);
  const pinColor = tier === "verified" ? "#16a34a" : tier === "community" ? "#2563eb" : "#d97706";
  const pinBorder = tier === "verified" ? "#15803d" : tier === "community" ? "#1d4ed8" : "#b45309";

  return (
    <>
      <AdvancedMarker ref={markerRef} position={{ lat: place.lat, lng: place.lng }} title={place.name} onClick={() => onSelect(place.id)}>
        <Pin background={pinColor} borderColor={pinBorder} glyphColor="#ffffff" />
      </AdvancedMarker>
      {selected && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => onSelect(null)}>
          <div className="max-w-[240px] space-y-2 p-1">
            <p className="font-semibold text-emerald-950">{place.name}</p>
            <TrustBadge place={place} />
            <p className="text-xs text-neutral-600">{place.address}</p>
            <ConfirmButton place={place} onConfirmed={onConfirmed} />
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export default function Home() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("places")
        .select("*")
        .order("confirmation_count", { ascending: false })
        .order("name", { ascending: true });
      if (cancelled) return;
      if (fetchError) { setError(fetchError.message); setPlaces([]); }
      else setPlaces((data as Place[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  function handleConfirmed(id: string) {
    setPlaces((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, confirmation_count: (p.confirmation_count ?? 0) + 1, confirmed_by: [...(p.confirmed_by ?? []), getDeviceId()] }
          : p
      )
    );
  }

  function matchesFilter(category: string, f: Filter) {
    const c = category.toLowerCase();
    if (f === "all") return true;
    if (f === "restaurants") return c.includes("restaurant");
    if (f === "grocery") return c.includes("grocery");
    if (f === "mosque") return c.includes("mosque");
    return true;
  }

  const filtered = useMemo(() => places.filter((p) => matchesFilter(p.category, filter)), [places, filter]);
  const mappable = useMemo(() => filtered.filter(hasCoords), [filtered]);

  return (
    <div className="min-h-dvh bg-emerald-50 text-emerald-950">
      <header className="sticky top-0 z-20 border-b border-emerald-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:py-5">
          <h1 className="text-xl font-bold tracking-tight text-emerald-800 sm:text-2xl">HalalHits 🕌</h1>
          <div className="flex rounded-full border border-emerald-200 bg-emerald-50/80 p-1 shadow-sm" role="group">
            {(["map", "list"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={v === view
                  ? "rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm capitalize"
                  : "rounded-full px-4 py-2 text-sm font-medium text-emerald-700 transition hover:text-emerald-900 capitalize"
                }>{v}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4 sm:pt-6">

        {/* Trust legend */}
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-xs text-emerald-700 shadow-sm">
          <span className="font-semibold text-emerald-800">Trust:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">✓ Verified</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-800">👥 Community confirmed</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">⚠ Needs confirmation</span>
        </div>

        {/* Filters */}
        <div className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)}
              className={filter === f.id
                ? "rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-2 ring-emerald-600 ring-offset-2 ring-offset-emerald-50"
                : "rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
              }>{f.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
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
            <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
              <APIProvider apiKey={GOOGLE_MAPS_KEY} libraries={["marker"]}>
                <Map mapId={MAP_ID} defaultCenter={STOCKHOLM} defaultZoom={11} gestureHandling="greedy" className="h-[min(70dvh,520px)] w-full sm:h-[480px]">
                  {mappable.map((place) => (
                    <PlaceMarker key={place.id} place={place} selected={selectedMarkerId === place.id} onSelect={setSelectedMarkerId} onConfirmed={handleConfirmed} />
                  ))}
                </Map>
              </APIProvider>
            </div>
          )
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-emerald-200 bg-white px-4 py-8 text-center text-sm text-emerald-700">No places in this category yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((place) => (
              <li key={place.id}>
                <article className="roun