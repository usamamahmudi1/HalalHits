"use client";

import Link from "next/link";
import { useState } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const CATEGORIES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "grocery", label: "Grocery" },
  { value: "mosque", label: "Mosque" },
] as const;

type HoursMode = "none" | "manual";
type CategoryValue = "restaurant" | "grocery" | "mosque";

type GoogleResult = {
  placeId: string;
  name: string | null;
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
  opensAt: string | null;
  closesAt: string | null;
  weekdayText: string | null;
  phone: string | null;
  website: string | null;
  googleRating: number | null;
  googleReviewCount: number | null;
  googleMapsUrl: string | null;
  priceLevel: number | null;
  types: string[];
};

function categoryForDb(value: string) {
  if (value === "grocery") return "Grocery";
  if (value === "mosque") return "Mosque";
  return "Restaurant";
}

function stripMissingColumn(row: Record<string, unknown>, error: PostgrestError): Record<string, unknown> | null {
  const msg = error.message;
  const m = msg.match(/the '([^']+)' column/i) || msg.match(/['`]([a-z0-9_]+)['`]\s+column/i) || msg.match(/could not find the '([^']+)' column/i);
  const col = m?.[1]?.toLowerCase();
  if (!col || !(col in row)) return null;
  const next = { ...row };
  delete next[col];
  return next;
}

async function insertPlaceRow(initial: Record<string, unknown>): Promise<{ error: PostgrestError | null }> {
  let row = { ...initial };
  for (let i = 0; i < 20; i++) {
    const { error } = await supabase.from("places").insert(row);
    if (!error) return { error: null };
    const next = stripMissingColumn(row, error);
    if (!next) return { error };
    row = next;
  }
  const { error } = await supabase.from("places").insert(row);
  return { error };
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} className={`h-3.5 w-3.5 ${rating >= s ? "text-amber-400" : rating >= s - 0.5 ? "text-amber-300" : "text-gray-200"}`} viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

export default function SubmitPlacePage() {
  // Search state
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<GoogleResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CategoryValue>("restaurant");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Stockholm");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [jummahTime, setJummahTime] = useState("");
  const [wuduFacilities, setWuduFacilities] = useState(false);
  const [languagesSpoken, setLanguagesSpoken] = useState("");
  const [note, setNote] = useState("");
  const [hoursMode, setHoursMode] = useState<HoursMode>("none");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [googleRating, setGoogleRating] = useState<number | null>(null);
  const [googleReviewCount, setGoogleReviewCount] = useState<number | null>(null);
  const [googleMapsUrl, setGoogleMapsUrl] = useState<string | null>(null);
  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);
  const [priceLevel, setPriceLevel] = useState<number | null>(null);
  const [weekdayText, setWeekdayText] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function searchGoogle() {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      const res = await fetch("/api/fetch-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeName: searchQuery.trim(),
          address: "",
          city: "Sweden",
        }),
      });
      const data = await res.json() as GoogleResult & { error?: string };
      if (!res.ok) { setSearchError(data.error ?? "Not found on Google."); return; }
      setSearchResult(data);
    } catch {
      setSearchError("Network error.");
    } finally {
      setSearchLoading(false);
    }
  }

  function prefillFromGoogle(result: GoogleResult) {
    if (result.name) setName(result.name);
    if (result.formattedAddress) setAddress(result.formattedAddress);
    if (result.lat) setLat(result.lat);
    if (result.lng) setLng(result.lng);
    if (result.phone) setPhone(result.phone);
    if (result.website) setWebsite(result.website);
    if (result.googleRating) setGoogleRating(result.googleRating);
    if (result.googleReviewCount) setGoogleReviewCount(result.googleReviewCount);
    if (result.googleMapsUrl) setGoogleMapsUrl(result.googleMapsUrl);
    if (result.placeId) setGooglePlaceId(result.placeId);
    if (result.priceLevel) setPriceLevel(result.priceLevel);
    if (result.weekdayText) setWeekdayText(result.weekdayText);
    if (result.opensAt && result.closesAt) {
      setOpensAt(result.opensAt);
      setClosesAt(result.closesAt);
      setHoursMode("manual");
    }
    // Detect category from Google types
    const types = result.types ?? [];
    if (types.includes("mosque") || types.includes("place_of_worship")) setCategory("mosque");
    else if (types.includes("grocery_or_supermarket") || types.includes("supermarket") || types.includes("food")) setCategory("grocery");
    else setCategory("restaurant");

    // Extract city from address
    const addressParts = result.formattedAddress?.split(",") ?? [];
    if (addressParts.length >= 2) {
      const possibleCity = addressParts[addressParts.length - 2]?.trim().replace(/\d+/g, "").trim();
      if (possibleCity) setCity(possibleCity);
    }

    setPrefilled(true);
    setSearchMode(false);
    setSearchResult(null);
    setSearchQuery("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    if (!trimmedName || !trimmedAddress) {
      setMessage({ type: "err", text: "Name and address are required." });
      return;
    }
    setSubmitting(true);

    const row: Record<string, unknown> = {
      name: trimmedName,
      category: categoryForDb(category),
      address: trimmedAddress,
      city: city.trim() || "Stockholm",
      lat: lat ?? null,
      lng: lng ?? null,
      verified: false,
    };

    if (phone.trim()) row.phone = phone.trim();
    if (website.trim()) row.website = website.trim();
    if (googleRating) row.google_rating = googleRating;
    if (googleReviewCount) row.google_review_count = googleReviewCount;
    if (googleMapsUrl) row.google_maps_url = googleMapsUrl;
    if (googlePlaceId) row.google_place_id = googlePlaceId;
    if (priceLevel) row.price_level = priceLevel;
    if (description.trim()) row.description = description.trim();
    if (weekdayText) row.opening_hours_text = weekdayText;
    if (note.trim()) row.submitter_note = note.trim();
    if (hoursMode === "manual" && opensAt && closesAt) {
      row.opens_at = opensAt;
      row.closes_at = closesAt;
      row.hours_source = prefilled ? "google" : "manual";
    }
    if (category === "mosque") {
      if (jummahTime.trim()) row.jummah_time = jummahTime.trim();
      row.wudu_facilities = wuduFacilities;
      if (languagesSpoken.trim()) row.languages_spoken = languagesSpoken.trim();
    }

    const { error } = await insertPlaceRow(row);
    setSubmitting(false);

    if (error) { setMessage({ type: "err", text: error.message }); return; }

    setMessage({ type: "ok", text: "Thanks! Your place was submitted for review." });
    // Reset
    setName(""); setCategory("restaurant"); setAddress(""); setCity("Stockholm");
    setPhone(""); setWebsite(""); setDescription(""); setNote("");
    setJummahTime(""); setWuduFacilities(false); setLanguagesSpoken("");
    setOpensAt(""); setClosesAt(""); setHoursMode("none");
    setLat(null); setLng(null); setGoogleRating(null); setGoogleReviewCount(null);
    setGoogleMapsUrl(null); setGooglePlaceId(null); setPriceLevel(null);
    setWeekdayText(null); setPrefilled(false);
  }

  return (
    <div className="min-h-dvh bg-emerald-50 text-emerald-950">
      <header className="border-b border-emerald-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto max-w-lg px-4 py-4 sm:py-5">
          <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-emerald-600 hover:text-emerald-800">← Back to HalalHits</Link>
          <h1 className="mt-2 text-xl font-bold tracking-tight text-emerald-800 sm:text-2xl">Submit a place</h1>
          <p className="mt-1 text-sm text-emerald-700/90">Search Google to pre-fill details, or enter manually below.</p>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-28 pt-4 sm:pt-6 space-y-4">

        {/* Google Search Panel */}
        <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🔍</span>
            <p className="text-sm font-semibold text-emerald-800">Search Google first</p>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Recommended</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchGoogle(); } }}
              placeholder="e.g. Al-Baraka Grill Stockholm"
              className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
            <button
              type="button"
              onClick={() => void searchGoogle()}
              disabled={searchLoading || !searchQuery.trim()}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {searchLoading ? "…" : "Search"}
            </button>
          </div>

          {searchError && (
            <p className="mt-2 text-xs text-red-600">⚠ {searchError} — try a more specific name or enter manually below.</p>
          )}

          {searchResult && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-emerald-900">{searchResult.name}</p>
                  <p className="text-xs text-emerald-700 mt-0.5">{searchResult.formattedAddress}</p>
                  {searchResult.googleRating && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <StarRating rating={searchResult.googleRating} />
                      <span className="text-xs font-medium text-amber-700">{searchResult.googleRating}</span>
                      {searchResult.googleReviewCount && <span className="text-xs text-gray-500">({searchResult.googleReviewCount.toLocaleString()} reviews)</span>}
                    </div>
                  )}
                  {searchResult.opensAt && (
                    <p className="text-xs text-emerald-700 mt-0.5">🕐 {searchResult.opensAt} – {searchResult.closesAt}</p>
                  )}
                  {searchResult.phone && <p className="text-xs text-emerald-700">📞 {searchResult.phone}</p>}
                  {searchResult.website && <p className="text-xs text-blue-600 truncate">🌐 {searchResult.website}</p>}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => prefillFromGoogle(searchResult)}
                  className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  ✓ Use this place
                </button>
                <button
                  type="button"
                  onClick={() => setSearchResult(null)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {prefilled && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-2">
              <span className="text-emerald-600 text-sm">✓</span>
              <p className="text-xs font-medium text-emerald-800">Form pre-filled from Google — review and submit below</p>
            </div>
          )}
        </div>

        {/* Submit Form */}
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">

          {prefilled && googleRating && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 flex items-center gap-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <StarRating rating={googleRating} />
                  <span className="text-sm font-semibold text-amber-800">{googleRating}</span>
                </div>
                {googleReviewCount && <p className="text-xs text-amber-700">{googleReviewCount.toLocaleString()} Google reviews</p>}
              </div>
              {googleMapsUrl && (
                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs font-medium text-blue-600 underline">View on Maps</a>
              )}
            </div>
          )}

          <div>
            <label htmlFor="place-name" className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Place name</label>
            <input id="place-name" type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="e.g. Al-Baraka Grill" maxLength={200} />
          </div>

          <div>
            <label htmlFor="place-category" className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Category</label>
            <select id="place-category" value={category} onChange={(e) => setCategory(e.target.value as CategoryValue)}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="place-address" className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Address</label>
            <input id="place-address" type="text" required value={address} onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="Street and number" maxLength={300} />
          </div>

          <div>
            <label htmlFor="place-city" className="text-xs font-semibold uppercase tracking-wide text-emerald-700">City</label>
            <input id="place-city" type="text" value={city} onChange={(e) => setCity(e.target.value)}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="Stockholm" maxLength={120} />
          </div>

          <div>
            <label htmlFor="place-phone" className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Phone <span className="font-normal normal-case text-emerald-500">(optional)</span>
            </label>
            <input id="place-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="e.g. 08-123 456" maxLength={30} />
          </div>

          <div>
            <label htmlFor="place-website" className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Website <span className="font-normal normal-case text-emerald-500">(optional)</span>
            </label>
            <input id="place-website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="https://..." maxLength={500} />
          </div>

          {/* Description / food types */}
          <div>
            <label htmlFor="place-desc" className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              {category === "mosque" ? "About this mosque" : category === "grocery" ? "What's available" : "Food & menu description"}
              <span className="font-normal normal-case text-emerald-500 ml-1">(optional)</span>
            </label>
            <p className="mt-0.5 text-xs text-emerald-500">
              {category === "mosque"
                ? "e.g. Arabic, Urdu & Swedish khutbah, Quran classes, sisters' section available"
                : category === "grocery"
                  ? "e.g. Fresh halal meat, Pakistani spices, imported goods, frozen items"
                  : "e.g. Pakistani food, biryani, karahi, freshly baked naan, desserts"
              }
            </p>
            <textarea id="place-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="mt-1 w-full resize-y rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder={category === "mosque" ? "Describe this mosque…" : "Describe what's available…"}
              maxLength={1000} />
          </div>

          {/* Mosque-specific fields */}
          {category === "mosque" && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Mosque details</p>
              <div>
                <label htmlFor="jummah-time" className="text-xs font-semibold text-emerald-700">Jummah time <span className="font-normal text-emerald-500">(optional)</span></label>
                <input id="jummah-time" type="time" value={jummahTime} onChange={(e) => setJummahTime(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              </div>
              <div>
                <label htmlFor="languages" className="text-xs font-semibold text-emerald-700">Languages spoken <span className="font-normal text-emerald-500">(optional)</span></label>
                <input id="languages" type="text" value={languagesSpoken} onChange={(e) => setLanguagesSpoken(e.target.value)}
                  placeholder="e.g. Arabic, Urdu, Swedish"
                  className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  maxLength={200} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={wuduFacilities} onChange={(e) => setWuduFacilities(e.target.checked)} className="h-4 w-4 rounded accent-emerald-600" />
                <span className="text-sm text-emerald-800">Wudu facilities available</span>
              </label>
            </div>
          )}

          {/* Opening hours */}
          <fieldset className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Opening hours <span className="font-normal normal-case text-emerald-500">(optional)</span>
            </legend>
            <div className="flex flex-wrap gap-2 mb-3">
              {([["none", "No hours"], ["manual", "Enter times"]] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setHoursMode(id)}
                  className={hoursMode === id
                    ? "rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                    : "rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                  }>{label}</button>
              ))}
            </div>
            {hoursMode === "manual" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="opens-at" className="text-xs font-semibold text-emerald-700">Opens</label>
                  <input id="opens-at" type="time" value={opensAt} onChange={(e) => setOpensAt(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
                <div>
                  <label htmlFor="closes-at" className="text-xs font-semibold text-emerald-700">Closes</label>
                  <input id="closes-at" type="time" value={closesAt} onChange={(e) => setClosesAt(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                </div>
              </div>
            )}
          </fieldset>

          <div>
            <label htmlFor="place-note" className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Extra note <span className="font-normal normal-case text-emerald-500">(optional)</span>
            </label>
            <textarea id="place-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="mt-1 w-full resize-y rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="Anything else we should know?" maxLength={2000} />
          </div>

          {message && (
            <p className={message.type === "ok"
              ? "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
              : "rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
            }>{message.text}</p>
          )}

          <button type="submit" disabled={submitting}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
            {submitting ? "Submitting…" : "Submit for review"}
          </button>
        </form>
      </main>
    </div>
  );
}