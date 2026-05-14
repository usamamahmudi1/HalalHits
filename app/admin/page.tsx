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
};

export default function AdminPage() {
  const [rows, setRows] = useState<PendingPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string) {
    setBusyId(id);
    const { error: uErr } = await supabase
      .from("places")
      .update({ verified: true })
      .eq("id", id);
    setBusyId(null);
    if (uErr) {
      setError(uErr.message);
      return;
    }
    setRows((r) => r.filter((x) => x.id !== id));
  }

  async function remove(id: string) {
    setBusyId(id);
    const { error: dErr } = await supabase.from("places").delete().eq("id", id);
    setBusyId(null);
    if (dErr) {
      setError(dErr.message);
      return;
    }
    setRows((r) => r.filter((x) => x.id !== id));
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
          <h1 className="mt-2 text-xl font-bold text-emerald-800 sm:text-2xl">
            Pending places
          </h1>
          <p className="mt-1 text-sm text-emerald-700/90">
            Unverified submissions. Approve to show the green check, or delete
            to remove.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4 sm:pt-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-50"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
              aria-hidden
            />
          </div>
        ) : error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-emerald-200 bg-white px-4 py-8 text-center text-sm text-emerald-700">
            No pending places.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((p) => (
              <li key={p.id}>
                <article className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm ring-1 ring-emerald-100/60">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold text-emerald-900">
                        {p.name}
                      </h2>
                      <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase text-amber-900">
                        {p.category}
                      </span>
                      <p className="mt-2 text-sm text-emerald-800">
                        {p.address}
                      </p>
                      <p className="text-sm text-emerald-700/90">{p.city}</p>
                      {p.opens_at && p.closes_at ? (
                        <p className="mt-1 text-xs font-medium text-emerald-800">
                          Hours: {p.opens_at} – {p.closes_at}
                          {p.hours_source ? ` (${p.hours_source})` : ""}
                        </p>
                      ) : null}
                      {p.opening_hours_text ? (
                        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-emerald-50/80 p-2 text-xs text-emerald-900">
                          {p.opening_hours_text}
                        </pre>
                      ) : null}
                      {p.submitter_note ? (
                        <p className="mt-2 rounded-lg bg-emerald-50/80 px-2 py-1.5 text-xs text-emerald-800">
                          <span className="font-semibold">Note:</span>{" "}
                          {p.submitter_note}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-emerald-500">
                        {new Date(p.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => void approve(p.id)}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => void remove(p.id)}
                        className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
