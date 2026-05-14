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

type EditState = {
  name: string;
  category: string;
  address: string;
  city: string;
};

const CATEGORIES = ["Restaurant", "Grocery", "Mosque"];

const ADMIN_PASSWORD = "halalhits2026";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [rows, setRows] = useState<PendingPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [approvingAll, setApprovingAll] = useState(false);
  const [successCount, setSuccessCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: qErr } = await supabase
      .from("places")
      .select("*")
      .eq("verified", false)
      .order("created_at", { ascending: false });
    if (qErr) {
      setError(qErr.message);
      setRows([]);
    } else {
      setRows((data as PendingPlace[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function getEdit(p: PendingPlace): EditState {
    return edits[p.id] ?? {
      name: p.name,
      category: p.category,
      address: p.address,
      city: p.city,
    };
  }

  function setEdit(id: string, patch: Partial<EditState>) {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...getEdit(rows.find((r) => r.id === id)!), ...prev[id], ...patch },
    }));
  }

  async function approve(p: PendingPlace) {
    setBusyId(p.id);
    const edit = getEdit(p);
    const { error: uErr } = await supabase
      .from("places")
      .update({
        verified: true,
        name: edit.name.trim() || p.name,
        category: edit.category || p.category,
        address: edit.address.trim() || p.address,
        city: edit.city.trim() || p.city,
      })
      .eq("id", p.id);
    setBusyId(null);
    if (uErr) { setError(uErr.message); return; }
    setRows((r) => r.filter((x) => x.id !== p.id));
    setSuccessCount((c) => c + 1);
  }

  async function remove(p: PendingPlace) {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    setBusyId(p.id);
    const { error: dErr } = await supabase.from("places").delete().eq("id", p.id);
    setBusyId(null);
    if (dErr) { setError(dErr.message); return; }
    setRows((r) => r.filter((x) => x.id !== p.id));
  }

  async function approveAll() {
    if (!confirm(`Approve all ${rows.length} pending places?`)) return;
    setApprovingAll(true);
    for (const p of rows) {
      await supabase.from("places").update({ verified: true }).eq("id", p.id);
    }
    setApprovingAll(false);
    setSuccessCount((c) => c + rows.length);
    setRows([]);
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
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (pwInput === ADMIN_PASSWORD) setAuthed(true);
                else setPwError(true);
              }
            }}
            placeholder="Password"
            className="w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          {pwError && (
            <p className="mt-2 text-xs text-red-600">Incorrect password.</p>
          )}
          <button
            type="button"
            onClick={() => {
              if (pwInput === ADMIN_PASSWORD) setAuthed(true);
              else setPwError(true);
            }}
            className="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-emerald-50 text-emerald-950">
      <header className="border-b border-emerald-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 py-4 sm:py-5">
          <Link
            href="/"
            className="text-xs font-semibold uppercase tracking-wide text-emerald-600 hover:text-emerald-800"
          >
            ← Home
          </Link>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-emerald-800 sm:text-2xl">
                Admin
              </h1>
              <p className="mt-0.5 text-sm text-emerald-700/90">
                Review and approve community submissions
              </p>
            </div>
            {rows.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
                  {rows.length} pending
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4 sm:pt-6">

        {/* Top actions */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-50"
          >
            ↻ Refresh
          </button>
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => void approveAll()}
              disabled={approvingAll}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {approvingAll ? "Approving…" : `Approve all ${rows.length}`}
            </button>
          )}
          {successCount > 0 && (
            <span className="text-sm font-medium text-emerald-700">
              ✓ {successCount} approved this session
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-12 text-center shadow-sm">
            <p className="text-2xl">✅</p>
            <p className="mt-2 text-sm font-medium text-emerald-700">
              All clear — no pending submissions
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((p) => {
              const edit = getEdit(p);
              const isExpanded = expandedId === p.id;
              const isBusy = busyId === p.id;
              return (
                <li key={p.id}>
                  <article className="rounded-2xl border border-emerald-100 bg-white shadow-sm ring-1 ring-emerald-100/60 overflow-hidden">

                    {/* Card header */}
                    <div className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h2 className="text-lg font-semibold text-emerald-900">
                            {p.name}
                          </h2>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase text-amber-900">
                              {p.category}
                            </span>
                            {p.hours_source && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                                Hours: {p.hours_source}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm text-emerald-800">{p.address}</p>
                          <p className="text-sm text-emerald-700/80">{p.city}</p>
                          {p.opens_at && p.closes_at && (
                            <p className="mt-1 text-xs font-medium text-emerald-700">
                              🕐 {p.opens_at} – {p.closes_at}
                            </p>
                          )}
                          {p.submitter_note && (
                            <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                              💬 {p.submitter_note}
                            </p>
                          )}
                          <p className="mt-2 text-xs text-emerald-400">
                            Submitted {new Date(p.created_at).toLocaleString("sv-SE")}
                          </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex shrink-0 flex-col gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void approve(p)}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {isBusy ? "…" : "✓ Approve"}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void remove(p)}
                            className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            🗑 Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : p.id)}
                            className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            {isExpanded ? "▲ Less" : "✏️ Edit"}
                          </button>
                        </div>
                      </div>

                      {/* Google Maps verify link */}
                      
                        href={`https://www.google.com/maps/search/${encodeURIComponent(p.name + " " + p.address + " " + p.city)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-xs font-medium text-emerald-600 underline underline-offset-2 hover:text-emerald-800"
                      >
                        🔍 Verify on Google Maps
                      </a>
                    </div>

                    {/* Expandable edit panel */}
                    {isExpanded && (
                      <div className="border-t border-emerald-100 bg-emerald-50/50 p-4 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                          Edit before approving
                        </p>
                        <div>
                          <label className="text-xs font-medium text-emerald-700">Name</label>
                          <input
                            type="text"
                            value={edit.name}
                            onChange={(e) => setEdit(p.id, { name: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-emerald-700">Category</label>
                          <select
                            value={edit.category}
                            onChange={(e) => setEdit(p.id, { category: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-emerald-700">Address</label>
                          <input
                            type="text"
                            value={edit.address}
                            onChange={(e) => setEdit(p.id, { address: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-emerald-700">City</label>
                          <input
                            type="text"
                            value={edit.city}
                            onChange={(e) => setEdit(p.id, { city: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void approve(p)}
                          className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {isBusy ? "Saving…" : "✓ Save & Approve"}
                        </button>
                      </div>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}