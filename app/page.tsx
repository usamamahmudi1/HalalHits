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
};

type Filter = "all" | "restaurants" | "grocery" | "mosque";

type ViewMode = "list" | "map";

const STOCKHOLM = { lat: 59.3293, lng: 18.0686 };

/** Advanced Markers require a map ID; replace with your own Map ID for production. */
const MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID";

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim() ?? "";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "restaurants", label: "Restaurants" },
  { id: "grocery", label: "Grocery" },
  { id: "mosque", label: "Mosque" },
];

function matchesFilter(category: string, filter: Filter): boolean {
  const c = category.toLowerCase().trim();
  switch (filter) {
    case "all":
      return true;
    case "restaurants":
      return c.includes("restaurant");
    case "grocery":
      return c.includes("grocery");
    case "mosque":
      return c.includes("mosque");
    default:
      return true;
  }
}

function hasCoords(p: Place): p is Place & { lat: number; lng: number } {
  return (
    p.lat != null &&
    p.lng != null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng)
  );
}

function PlaceMarker({
  place,
  selected,
  onSelect,
}: {
  place: Place & { lat: number; lng: number };
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: place.lat, lng: place.lng }}
        title={place.name}
        onClick={() => onSelect(place.id)}
      >
        <Pin
          background="#16a34a"
          borderColor="#15803d"
          glyphColor="#ffffff"
        />
      </AdvancedMarker>
      {selected && marker ? (
        <InfoWindow anchor={marker} onCloseClick={() => onSelect(null)}>
          <div className="max-w-[220px] space-y-2 p-1 text-emerald-950">
            <p className="font-semibold leading-snug">{place.name}</p>
            <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">
              {place.category}
            </span>
            <p className="text-sm leading-snug text-neutral-700">
              {place.address}
            </p>
            {place.opens_at && place.closes_at ? (
              <p className="text-xs text-emerald-800">
                {place.opens_at} – {place.closes_at}
              </p>
            ) : place.opening_hours_text ? (
              <p className="line-clamp-3 text-xs text-emerald-800">
                {place.opening_hours_text}
              </p>
            ) : null}
          </div>
        </InfoWindow>
      ) : null}
    </>
  );
}

export default function Home() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(
    null,
  );

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

      if (fetchError) {
        setError(fetchError.message);
        setPlaces([]);
      } else {
        setPlaces((data as Place[]) ?? []);
      }
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () => places.filter((p) => matchesFilter(p.category, filter)),
    [places, filter],
  );

  const mappable = useMemo(() => filtered.filter(hasCoords), [filtered]);

  useEffect(() => {
    setSelectedMarkerId(null);
  }, [filter]);

  useEffect(() => {
    if (view !== "map") setSelectedMarkerId(null);
  }, [view]);

  return (
    <div className="min-h-dvh bg-emerald-50 text-emerald-950">
      <header className="sticky top-0 z-20 border-b border-emerald-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:py-5">
          <h1 className="text-xl font-bold tracking-tight text-emerald-800 sm:text-2xl">
            HalalHits 🕌
          </h1>
          <div
            className="flex rounded-full border border-emerald-200 bg-emerald-50/80 p-1 shadow-sm"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              onClick={() => setView("map")}
              className={
                view === "map"
                  ? "rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm"
                  : "rounded-full px-4 py-2 text-sm font-medium text-emerald-700 transition hover:text-emerald-900"
              }
            >
              Map
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={
                view === "list"
                  ? "rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm"
                  : "rounded-full px-4 py-2 text-sm font-medium text-emerald-700 transition hover:text-emerald-900"
              }
            >
              List
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4 sm:pt-6">
        <div className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={
                filter === f.id
                  ? "rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-2 ring-emerald-600 ring-offset-2 ring-offset-emerald-50"
                  : "rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
              aria-hidden
            />
            <p className="text-sm font-medium text-emerald-700">
              Loading places…
            </p>
          </div>
        ) : error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800">
            {error}
          </p>
        ) : view === "map" ? (
          !GOOGLE_MAPS_KEY ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-center text-sm text-amber-950">
              Add{" "}
              <code className="rounded bg-amber-100/80 px-1 py-0.5 text-xs">
                NEXT_PUBLIC_GOOGLE_MAPS_KEY
              </code>{" "}
              to <code className="text-xs">.env.local</code>, then restart the
              dev server.
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm ring-1 ring-emerald-100/60">
              <APIProvider apiKey={GOOGLE_MAPS_KEY} libraries={["marker"]}>
                <Map
                  mapId={MAP_ID}
                  defaultCenter={STOCKHOLM}
                  defaultZoom={11}
                  gestureHandling="greedy"
                  className="h-[min(70dvh,520px)] w-full sm:h-[480px]"
                >
                  {mappable.map((place) => (
                    <PlaceMarker
                      key={place.id}
                      place={place}
                      selected={selectedMarkerId === place.id}
                      onSelect={setSelectedMarkerId}
                    />
                  ))}
                </Map>
              </APIProvider>
              {filtered.length > 0 && mappable.length === 0 ? (
                <p className="border-t border-emerald-100 px-4 py-3 text-center text-sm text-emerald-700">
                  No places with coordinates in this filter. Showing map
                  centred on Stockholm.
                </p>
              ) : null}
            </div>
          )
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-emerald-200 bg-white px-4 py-8 text-center text-sm text-emerald-700">
            No places in this category yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((place) => (
              <li key={place.id}>
                <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm ring-1 ring-emerald-100/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-semibold text-emerald-900">
                          {place.name}
                        </h2>
                        {place.verified ? (
                          <span
                            className="inline-flex shrink-0 items-center text-emerald-600"
                            title="Verified"
                            aria-label="Verified"
                          >
                            <svg
                              className="h-5 w-5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              aria-hidden
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-emerald-700/90">
                        {place.city}
                      </p>
                      {place.opens_at && place.closes_at ? (
                        <p className="mt-1 text-xs font-medium text-emerald-700">
                          {place.opens_at} – {place.closes_at}
                        </p>
                      ) : place.opening_hours_text ? (
                        <p className="mt-1 line-clamp-2 text-xs text-emerald-700">
                          {place.opening_hours_text}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                      {place.category}
                    </span>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Link
        href="/submit"
        className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg ring-2 ring-white/90 transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/70"
        aria-label="Submit a place"
      >
        <svg
          className="h-7 w-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
    </div>
  );
}
