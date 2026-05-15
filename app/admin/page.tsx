"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type PendingPlace = {
  id: string;
  name: string;
  category: string;
  address: string;
  city: string;
  created_at: string;
  submitter_note?: string | null;
  opens_at?: string | null;
  closes_at?: string | null;
  opening_hours_text?: string | null;
  hours_source?: string | null;
  google_place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type HoursSuggestion = {
  id: string;
  place_id: string;
  suggestion: string;
  opens_at: string | null;
  closes_at: string | null;
  device_id: string | null;
  upvotes: number;
  status: string;
  created_at: string;
};

type PlaceWithSuggestions = PendingPlace & {
  suggestions: HoursSuggestion[];
  fetchedHours?: { opensAt: string | null; closesAt: string | null; weekdayText: string | null } | null;
  fetchLoading?: boolean;
  fetchError?: string | null;
  fetchDone?: boolean;
};

type EditState = { name: string; category: string; address: string; city: string };
type Tab = "pending" | "hours";

const CATEGORIES = ["Restaurant", "Grocery", "Mosque"];
const ADMIN_PASSWORD = "halalhits2026";

async function fetchHoursForPlace(
  place: PendingPlace,
  apiKey?: string,
): Promise<{ opensAt: string | null; closesAt: string | null; weekdayText: string | null; error?: string }> {
  try {
    const res = await fetch("/api/fetch-hours", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeName: place.name, address: place.address, city: place.city }),
    });
    const data = await res.json() as {
      error?: string;
      opensAt?: string | null;
      closesAt?: string | null;
      weekdayText?: string | null;
    };
    if (!res.ok) return { opensAt: null, closesAt: null, weekdayText: null, error: data.error ?? "Not found" };
    return { opensAt: data.opensAt ?? null, closesAt: data.closesAt ?? null, weekdayText: data.weekdayText ?? null };
  } catch {
    return { opensAt: null, closesAt: null, weekdayText: null, error: "Network error" };
  }
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [tab, setTab] = useState<Tab>("pending");

  const [rows, setRows] = useState<PendingPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [approvingAll, setApprovingAll] = useState(false);
  const [successCount, setSuccessCount] = useState(0);

  const [hoursPlaces, setHoursPlaces] = useState<PlaceWithSuggestions[]>([]);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursExpandedId, setHoursExpandedId] = useState<string | null>(null);

  // Bulk fetch state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkFetching, setBulkFetching] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [bulkResults, setBulkResults] = useState<{ found: number; notFound: number; applied: number } | null>(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: qErr } = await supabase
      .from("places")
      .select("*")
      .eq("verified", false)
      .order("created_at", { ascending: false });
    if (qErr) { setError(qErr.message); setRows([]); }
    else setRows((data as PendingPlace[]) ?? []);
    setLoading(false);
  }, []);

  const loadHours = useCallback(async () => {
    setHoursLoading(true);
    setSelectedIds(new Set());
    setBulkResults(null);
    const { data: suggestions } = await supabase
      .from("hours_suggestions")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const { data: places } = await supabase
      .from("places")
      .select("id, name, category, address, city, opens_at, closes_at, opening_hours_text, hours_source")
      .order("name", { ascending: true });

    const suggs = (suggestions ?? []) as HoursSuggestion[];
    const placeList = (places ?? []) as PendingPlace[];

    setHoursPlaces(placeList.map(p => ({
      ...p,
      suggestions: suggs.filter(s => s.place_id === p.id),
      fetchedHours: null,
      fetchLoading: false,
      fetchError: null,
      fetchDone: false,
    })));
    setHoursLoading(false);
  }, []);

  useEffect(() => { void loadPending(); }, [loadPending]);
  useEffect(() => { if (tab === "hours") void loadHours(); }, [tab, loadHours]);

  function getEdit(p: PendingPlace): EditState {
    return edits[p.id] ?? { name: p.name, category: p.category, address: p.address, city: p.city };
  }

  function setEdit(id: string, patch: Partial<EditState>) {
    setEdits(prev => ({ ...prev, [id]: { ...getEdit(rows.find(r => r.id === id)!), ...prev[id], ...patch } }));
  }

  async function approve(p: PendingPlace) {
    setBusyId(p.id);
    const edit = getEdit(p);
    const { error: uErr } = await supabase.from("places").update({
      verified: true,
      name: edit.name.trim() || p.name,
      category: edit.category || p.category,
      address: edit.address.trim() || p.address,
      city: edit.city.trim() || p.city,
    }).eq("id", p.id);
    setBusyId(null);
    if (uErr) { setError(uErr.message); return; }
    setRows(r => r.filter(x => x.id !== p.id));
    setSuccessCount(c => c + 1);
  }

  async function remove(p: PendingPlace) {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    setBusyId(p.id);
    await supabase.from("places").delete().eq("id", p.id);
    setBusyId(null);
    setRows(r => r.filter(x => x.id !== p.id));
  }

  async function approveAll() {
    if (!confirm(`Approve all ${rows.length} pending places?`)) return;
    setApprovingAll(true);
    for (const p of rows) await supabase.from("places").update({ verified: true }).eq("id", p.id);
    setApprovingAll(false);
    setSuccessCount(c => c + rows.length);
    setRows([]);
  }

  async function fetchSingleHours(placeId: string) {
    const place = hoursPlaces.find(p => p.id === placeId);
    if (!place) return;
    setHoursPlaces(prev => prev.map(p => p.id === placeId ? { ...p, fetchLoading: true, fetchError: null } : p));
    const result = await fetchHoursForPlace(place);
    setHoursPlaces(prev => prev.map(p => p.id === placeId ? {
      ...p,
      fetchLoading: false,
      fetchError: result.error ?? null,
      fetchedHours: result.error ? null : { opensAt: result.opensAt, closesAt: result.closesAt, weekdayText: result.weekdayText },
    } : p));
  }

  async function applyHours(placeId: string, opensAt: string | null, closesAt: string | null, hoursText: string | null, source: string) {
    const { error } = await supabase.from("places").update({
      opens_at: opensAt,
      closes_at: closesAt,
      opening_hours_text: hoursText,
      hours_source: source,
    }).eq("id", placeId);
    if (!error) {
      setHoursPlaces(prev => prev.map(p => p.id === placeId
        ? { ...p, opens_at: opensAt, closes_at: closesAt, fetchDone: true }
        : p
      ));
    }
  }

  async function acceptSuggestion(suggestion: HoursSuggestion) {
    await supabase.from("places").update({
      opens_at: suggestion.opens_at,
      closes_at: suggestion.closes_at,
      hours_source: "community",
    }).eq("id", suggestion.place_id);
    await supabase.from("hours_suggestions").update({ status: "accepted" }).eq("id", suggestion.id);
    setHoursPlaces(prev => prev.map(p => p.id === suggestion.place_id
      ? { ...p, opens_at: suggestion.opens_at, closes_at: suggestion.closes_at, suggestions: p.suggestions.filter(s => s.id !== suggestion.id) }
      : p
    ));
  }

  async function dismissSuggestion(id: string) {
    await supabase.from("hours_suggestions").update({ status: "dismissed" }).eq("id", id);
    setHoursPlaces(prev => prev.map(p => ({ ...p, suggestions: p.suggestions.filter(s => s.id !== id) })));
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const missingHours = hoursPlaces.filter(p => !p.opens_at || !p.closes_at);
    setSelectedIds(new Set(missingHours.map(p => p.id)));
  }

  function selectNone() { setSelectedIds(new Set()); }

  async function bulkFetchHours(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(`Fetch hours from Google for ${ids.length} place${ids.length > 1 ? "s" : ""}? This uses Google API credits.`)) return;

    setBulkFetching(true);
    setBulkResults(null);
    let found = 0;
    let notFound = 0;
    let applied = 0;

    for (let i = 0; i < ids.length; i++) {
      const place = hoursPlaces.find(p => p.id === ids[i]);
      if (!place) continue;

      setBulkProgress({ done: i, total: ids.length, current: place.name });
      setHoursPlaces(prev => prev.map(p => p.id === ids[i] ? { ...p, fetchLoading: true, fetchError: null } : p));

      // Small delay to avoid hammering the API
      if (i > 0) await new Promise(r => setTimeout(r, 500));

      const result = await fetchHoursForPlace(place);

      if (result.error || (!result.opensAt && !result.closesAt && !result.weekdayText)) {
        notFound++;
        setHoursPlaces(prev => prev.map(p => p.id === ids[i] ? {
          ...p,
          fetchLoading: false,
          fetchError: result.error ?? "No hours found",
        } : p));
      } else {
        found++;
        // Auto-apply if we got hours
        if (result.opensAt || result.closesAt) {
          const { error } = await supabase.from("places").update({
            opens_at: result.opensAt,
            closes_at: result.closesAt,
            opening_hours_text: result.weekdayText,
            hours_source: "google",
          }).eq("id", ids[i]);
          if (!error) applied++;
        }
        setHoursPlaces(prev => prev.map(p => p.id === ids[i] ? {
          ...p,
          fetchLoading: false,
          fetchError: null,
          opens_at: result.opensAt ?? p.opens_at,
          closes_at: result.closesAt ?? p.closes_at,
          fetchedHours: { opensAt: result.opensAt, closesAt: result.closesAt, weekdayText: result.weekdayText },
          fetchDone: true,
        } : p));
      }
    }

    setBulkProgress(null);
    setBulkFetching(false);
    setBulkResults({ found, notFound, applied });
    setSelectedIds(new Set());
  }

  if (!authed) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-emerald-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-xl font-bold text-emerald-800">Admin access</h1>
          <p className="mb-4 text-sm text-emerald-600">Enter the admin password to continue.</p>
          <input
            type="password"
            value={pwInput}
            onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { if (pwInput === ADMIN_PASSWORD) setAuthed(true); else setPwError(true); } }}
            placeholder="Password"
            className="w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          {pwError && <p className="mt-2 text-xs text-red-600">Incorrect password.</p>}
          <button
            type="button"
            onClick={() => { if (pwInput === ADMIN_PASSWORD) setAuthed(true); else setPwError(true); }}
            className="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >Enter</button>
        </div>
      </div>
    );
  }

  const placesWithoutHours = hoursPlaces.filter(p => !p.opens_at || !p.closes_at);

  return (
    <div className="min-h-dvh bg-emerald-50 text-emerald-950">
      <header className="border-b border-emerald-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 py-4 sm:py-5">
          <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-emerald-600 hover:text-emerald-800">← Home</Link>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-emerald-800 sm:text-2xl">Admin</h1>
              <p className="mt-0.5 text-sm text-emerald-700/90">Manage submissions and opening hours</p>
            </div>
            {rows.length > 0 && tab === "pending" && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">{rows.length} pending</span>
            )}
          </div>
          <div className="mt-3 flex gap-1 rounded-xl border border-emerald-100 bg-emerald-50/50 p-1">
            <button type="button" onClick={() => setTab("pending")}
              className={tab === "pending" ? "flex-1 rounded-lg bg-white py-2 text-sm font-semibold text-emerald-800 shadow-sm" : "flex-1 rounded-lg py-2 text-sm font-medium text-emerald-600 hover:text-emerald-800"}>
              🏪 Pending {rows.length > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">{rows.length}</span>}
            </button>
            <button type="button" onClick={() => setTab("hours")}
              className={tab === "hours" ? "flex-1 rounded-lg bg-white py-2 text-sm font-semibold text-emerald-800 shadow-sm" : "flex-1 rounded-lg py-2 text-sm font-medium text-emerald-600 hover:text-emerald-800"}>
              🕐 Hours
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4 sm:pt-6">

        {/* ── PENDING PLACES TAB ── */}
        {tab === "pending" && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void loadPending()} className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-50">↻ Refresh</button>
              {rows.length > 1 && (
                <button type="button" onClick={() => void approveAll()} disabled={approvingAll} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                  {approvingAll ? "Approving…" : `Approve all ${rows.length}`}
                </button>
              )}
              {successCount > 0 && <span className="text-sm font-medium text-emerald-700">✓ {successCount} approved</span>}
            </div>
            {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}
            {loading ? (
              <div className="flex justify-center py-16"><div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" /></div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-12 text-center shadow-sm">
                <p className="text-2xl">✅</p>
                <p className="mt-2 text-sm font-medium text-emerald-700">All clear — no pending submissions</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-4">
                {rows.map((p) => {
                  const edit = getEdit(p);
                  const isExpanded = expandedId === p.id;
                  const isBusy = busyId === p.id;
                  return (
                    <li key={p.id}>
                      <article className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm ring-1 ring-emerald-100/60">
                        <div className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h2 className="text-lg font-semibold text-emerald-900">{p.name}</h2>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase text-amber-900">{p.category}</span>
                                {p.hours_source && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">Hours: {p.hours_source}</span>}
                              </div>
                              <p className="mt-2 text-sm text-emerald-800">{p.address}</p>
                              <p className="text-sm text-emerald-700/80">{p.city}</p>
                              {p.opens_at && p.closes_at && <p className="mt-1 text-xs font-medium text-emerald-700">🕐 {p.opens_at} – {p.closes_at}</p>}
                              {p.submitter_note && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">💬 {p.submitter_note}</p>}
                              <p className="mt-2 text-xs text-emerald-400">Submitted {new Date(p.created_at).toLocaleString("sv-SE")}</p>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2">
                              <button type="button" disabled={isBusy} onClick={() => void approve(p)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">{isBusy ? "…" : "✓ Approve"}</button>
                              <button type="button" disabled={isBusy} onClick={() => void remove(p)} className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">🗑 Delete</button>
                              <button type="button" onClick={() => setExpandedId(isExpanded ? null : p.id)} className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">{isExpanded ? "▲ Less" : "✏️ Edit"}</button>
                            </div>
                          </div>
                          <a href={`https://www.google.com/maps/search/${encodeURIComponent(p.name + " " + p.address + " " + p.city)}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-medium text-emerald-600 underline underline-offset-2 hover:text-emerald-800">🔍 Verify on Google Maps</a>
                        </div>
                        {isExpanded && (
                          <div className="space-y-3 border-t border-emerald-100 bg-emerald-50/50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Edit before approving</p>
                            {(["name", "address", "city"] as const).map((field) => (
                              <div key={field}>
                                <label className="text-xs font-medium text-emerald-700 capitalize">{field}</label>
                                <input type="text" value={edit[field]} onChange={(e) => setEdit(p.id, { [field]: e.target.value })} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                              </div>
                            ))}
                            <div>
                              <label className="text-xs font-medium text-emerald-700">Category</label>
                              <select value={edit.category} onChange={(e) => setEdit(p.id, { category: e.target.value })} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30">
                                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <button type="button" disabled={isBusy} onClick={() => void approve(p)} className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{isBusy ? "Saving…" : "✓ Save & Approve"}</button>
                          </div>
                        )}
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {/* ── HOURS TAB ── */}
        {tab === "hours" && (
          <>
            {/* Bulk action bar */}
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Bulk fetch from Google</p>
                  <p className="text-xs text-emerald-600 mt-0.5">{placesWithoutHours.length} places missing hours · {selectedIds.size} selected</p>
                </div>
                <button type="button" onClick={() => void loadHours()} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">↻ Refresh</button>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                <button type="button" onClick={selectAll} disabled={bulkFetching} className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
                  Select all without hours ({placesWithoutHours.length})
                </button>
                <button type="button" onClick={() => setSelectedIds(new Set(hoursPlaces.map(p => p.id)))} disabled={bulkFetching} className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
                  Select all ({hoursPlaces.length})
                </button>
                {selectedIds.size > 0 && (
                  <button type="button" onClick={selectNone} disabled={bulkFetching} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                    Deselect all
                  </button>
                )}
              </div>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => void bulkFetchHours(Array.from(selectedIds))}
                  disabled={bulkFetching}
                  className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {bulkFetching ? "Fetching…" : `🔍 Fetch hours for ${selectedIds.size} place${selectedIds.size > 1 ? "s" : ""}`}
                </button>
              )}

              {/* Progress bar */}
              {bulkProgress && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-emerald-700 mb-1">
                    <span>Fetching: {bulkProgress.current}</span>
                    <span>{bulkProgress.done}/{bulkProgress.total}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-emerald-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Bulk results */}
              {bulkResults && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm font-semibold text-emerald-800">Bulk fetch complete</p>
                  <div className="mt-1 flex gap-4 text-xs">
                    <span className="text-emerald-700">✓ {bulkResults.found} found</span>
                    <span className="text-emerald-700">💾 {bulkResults.applied} applied</span>
                    <span className="text-amber-700">⚠ {bulkResults.notFound} not found</span>
                  </div>
                </div>
              )}
            </div>

            {hoursLoading ? (
              <div className="flex justify-center py-16"><div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" /></div>
            ) : hoursPlaces.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-12 text-center shadow-sm">
                <p className="text-2xl">🕐</p>
                <p className="mt-2 text-sm font-medium text-emerald-700">No places to show</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {hoursPlaces.map((p) => {
                  const isExpanded = hoursExpandedId === p.id;
                  const isSelected = selectedIds.has(p.id);
                  const hasHours = !!(p.opens_at && p.closes_at);
                  return (
                    <li key={p.id}>
                      <article className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all ${isSelected ? "border-emerald-400 ring-1 ring-emerald-300" : "border-emerald-100"} ${p.fetchDone ? "border-emerald-300" : ""}`}>
                        <div className="p-4">
                          <div className="flex items-start gap-3">
                            {/* Checkbox */}
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(p.id)}
                              disabled={bulkFetching}
                              className="mt-1.5 h-4 w-4 rounded border-emerald-300 accent-emerald-600 cursor-pointer"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h2 className="text-base font-semibold text-emerald-900">{p.name}</h2>
                                  <p className="text-xs text-emerald-700/80">{p.address}, {p.city}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setHoursExpandedId(isExpanded ? null : p.id)}
                                  className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                >
                                  {isExpanded ? "▲" : "Manage"}
                                </button>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                {hasHours
                                  ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">🕐 {p.opens_at} – {p.closes_at}</span>
                                  : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">⚠ No hours</span>
                                }
                                {p.fetchDone && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">✓ Updated</span>}
                                {p.fetchLoading && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 animate-pulse">Fetching…</span>}
                                {p.fetchError && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">✗ Not found</span>}
                                {p.suggestions.length > 0 && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">{p.suggestions.length} suggestion{p.suggestions.length > 1 ? "s" : ""}</span>}
                              </div>
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="space-y-4 border-t border-emerald-100 bg-emerald-50/30 p-4">

                            {p.suggestions.length > 0 && (
                              <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">👥 Community suggestions</p>
                                <div className="space-y-2">
                                  {p.suggestions.map((s) => (
                                    <div key={s.id} className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                                      <p className="text-sm font-medium text-blue-900">{s.suggestion}</p>
                                      {s.opens_at && s.closes_at && <p className="mt-0.5 text-xs text-blue-700">🕐 {s.opens_at} – {s.closes_at}</p>}
                                      <p className="mt-1 text-xs text-blue-500">{new Date(s.created_at).toLocaleString("sv-SE")}</p>
                                      <div className="mt-2 flex gap-2">
                                        <button type="button" onClick={() => void acceptSuggestion(s)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">✓ Accept</button>
                                        <button type="button" onClick={() => void dismissSuggestion(s.id)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">✕ Dismiss</button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">🔍 Fetch from Google</p>
                              <button type="button" onClick={() => void fetchSingleHours(p.id)} disabled={p.fetchLoading ?? false} className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
                                {p.fetchLoading ? "Fetching…" : "Fetch hours from Google"}
                              </button>
                              {p.fetchError && <p className="mt-2 text-xs text-red-600">⚠ {p.fetchError}</p>}
                              {p.fetchedHours && (
                                <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3">
                                  <p className="text-xs font-semibold text-emerald-700 mb-2">Google returned:</p>
                                  {p.fetchedHours.opensAt && <p className="text-sm text-emerald-900">🕐 {p.fetchedHours.opensAt} – {p.fetchedHours.closesAt}</p>}
                                  {p.fetchedHours.weekdayText && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">{p.fetchedHours.weekdayText}</pre>}
                                  <button type="button" onClick={() => void applyHours(p.id, p.fetchedHours!.opensAt, p.fetchedHours!.closesAt, p.fetchedHours!.weekdayText, "google")} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">✓ Apply these hours</button>
                                </div>
                              )}
                            </div>

                            <ManualHoursForm place={p} onSave={(o, c) => void applyHours(p.id, o, c, null, "manual")} />
                          </div>
                        )}
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ManualHoursForm({ place, onSave }: { place: PlaceWithSuggestions; onSave: (opensAt: string, closesAt: string) => void }) {
  const [opensAt, setOpensAt] = useState(place.opens_at ?? "");
  const [closesAt, setClosesAt] = useState(place.closes_at ?? "");
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">✏️ Set manually</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-emerald-700">Opens</label>
          <input type="time" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
        </div>
        <div>
          <label className="text-xs font-medium text-emerald-700">Closes</label>
          <input type="time" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
        </div>
      </div>
      <button type="button" onClick={() => onSave(opensAt, closesAt)} disabled={!opensAt || !closesAt} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">Save hours</button>
    </div>
  );
}