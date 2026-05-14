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

type HoursMode = "none" | "manual" | "google";

function categoryForDb(value: string) {
  const v = value.toLowerCase();
  if (v === "grocery") return "Grocery";
  if (v === "mosque") return "Mosque";
  return "Restaurant";
}

function stripMissingColumnFromRow(
  row: Record<string, unknown>,
  error: PostgrestError,
): Record<string, unknown> | null {
  const msg = error.message;
  const m =
    msg.match(/the '([^']+)' column/i) ||
    msg.match(/['`]([a-z0-9_]+)['`]\s+column/i) ||
    msg.match(/could not find the '([^']+)' column/i);
  const col = m?.[1]?.toLowerCase();
  if (!col || !(col in row)) return null;
  const next = { ...row };
  delete next[col];
  return next;
}

async function insertPlaceRow(
  initial: Record<string, unknown>,
): Promise<{ error: PostgrestError | null }> {
  let row: Record<string, unknown> = { ...initial };
  for (let i = 0; i < 16; i++) {
    const { error } = await supabase.from("places").insert(row);
    if (!error) return { error: null };
    const next = stripMissingColumnFromRow(row, error);
    if (!next) return { error };
    row = next;
  }
  const { error } = await supabase.from("places").insert(row);
  return { error };
}

export default function SubmitPlacePage() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("restaurant");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Stockholm");
  const [note, setNote] = useState("");

  const [hoursMode, setHoursMode] = useState<HoursMode>("none");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [googlePlaceInput, setGooglePlaceInput] = useState("");
  const [openingHoursText, setOpeningHoursText] = useState("");
  const [fetchedPlaceId, setFetchedPlaceId] = useState<string | null>(null);
  const [googleFetchLoading, setGoogleFetchLoading] = useState(false);
  const [googleFetchMessage, setGoogleFetchMessage] = useState<string | null>(
    null,
  );

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  function resetHours() {
    setOpensAt("");
    setClosesAt("");
    setGooglePlaceInput("");
    setOpeningHoursText("");
    setFetchedPlaceId(null);
    setGoogleFetchMessage(null);
  }

  async function fetchGoogleHours() {
    setGoogleFetchMessage(null);
    if (!googlePlaceInput.trim()) {
      setGoogleFetchMessage("Paste a Place ID or Google Maps link first.");
      return;
    }
    setGoogleFetchLoading(true);
    try {
      const r = await fetch("/api/place-opening-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeIdOrUrl: googlePlaceInput.trim() }),
      });
      const j = (await r.json()) as {
        error?: string;
        placeId?: string;
        opensAt?: string | null;
        closesAt?: string | null;
        openingHoursText?: string | null;
      };
      if (!r.ok) {
        setGoogleFetchMessage(j.error ?? "Could not load hours.");
        return;
      }
      if (j.opensAt) setOpensAt(j.opensAt);
      if (j.closesAt) setClosesAt(j.closesAt);
      if (j.openingHoursText) setOpeningHoursText(j.openingHoursText);
      setFetchedPlaceId(j.placeId ?? null);
      if (j.opensAt || j.closesAt || j.openingHoursText) {
        setGoogleFetchMessage("Hours loaded — you can still edit them below.");
      } else {
        setGoogleFetchMessage(
          "No structured hours returned for today; you can type times manually or edit the schedule text.",
        );
      }
    } catch {
      setGoogleFetchMessage("Network error while contacting Google.");
    } finally {
      setGoogleFetchLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    const trimmedCity = city.trim() || "Stockholm";

    if (!trimmedName || !trimmedAddress) {
      setMessage({ type: "err", text: "Name and address are required." });
      return;
    }

    const o = opensAt.trim();
    const c = closesAt.trim();
    if (hoursMode === "manual" && (o || c) && !(o && c)) {
      setMessage({
        type: "err",
        text: "Enter both opening and closing times, or clear both.",
      });
      return;
    }

    setSubmitting(true);

    const row: Record<string, unknown> = {
      name: trimmedName,
      category: categoryForDb(category),
      address: trimmedAddress,
      city: trimmedCity,
      lat: null,
      lng: null,
      verified: false,
    };

    const trimmedNote = note.trim();
    if (trimmedNote) {
      row.submitter_note = trimmedNote;
    }

    if (hoursMode !== "none") {
      if (o && c) {
        row.opens_at = o;
        row.closes_at = c;
        row.hours_source = hoursMode === "google" ? "google" : "manual";
      }
      const sched = openingHoursText.trim();
      if (sched) {
        row.opening_hours_text = sched;
        if (!row.hours_source) row.hours_source = "google";
      }
      if (hoursMode === "google" && fetchedPlaceId) {
        row.google_place_id = fetchedPlaceId;
      }
    }

    const { error } = await insertPlaceRow(row);

    setSubmitting(false);

    if (error) {
      setMessage({ type: "err", text: error.message });
      return;
    }

    setMessage({
      type: "ok",
      text: "Thanks! Your place was submitted for review.",
    });
    setName("");
    setCategory("restaurant");
    setAddress("");
    setCity("Stockholm");
    setNote("");
    setHoursMode("none");
    resetHours();
  }

  return (
    <div className="min-h-dvh bg-emerald-50 text-emerald-950">
      <header className="border-b border-emerald-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto max-w-lg px-4 py-4 sm:py-5">
          <Link
            href="/"
            className="text-xs font-semibold uppercase tracking-wide text-emerald-600 hover:text-emerald-800"
          >
            ← Back to HalalHits
          </Link>
          <h1 className="mt-2 text-xl font-bold tracking-tight text-emerald-800 sm:text-2xl">
            Submit a place
          </h1>
          <p className="mt-1 text-sm text-emerald-700/90">
            Suggest a halal spot in Sweden. We review submissions before they
            show as verified.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-28 pt-4 sm:pt-6">
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm ring-1 ring-emerald-100/60"
        >
          <div>
            <label
              htmlFor="place-name"
              className="text-xs font-semibold uppercase tracking-wide text-emerald-700"
            >
              Place name
            </label>
            <input
              id="place-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="e.g. Al-Baraka Grill"
              maxLength={200}
            />
          </div>

          <div>
            <label
              htmlFor="place-category"
              className="text-xs font-semibold uppercase tracking-wide text-emerald-700"
            >
              Category
            </label>
            <select
              id="place-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="place-address"
              className="text-xs font-semibold uppercase tracking-wide text-emerald-700"
            >
              Address
            </label>
            <input
              id="place-address"
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="Street and number"
              maxLength={300}
            />
          </div>

          <div>
            <label
              htmlFor="place-city"
              className="text-xs font-semibold uppercase tracking-wide text-emerald-700"
            >
              City
            </label>
            <input
              id="place-city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="Stockholm"
              maxLength={120}
            />
          </div>

          <fieldset className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Opening hours{" "}
              <span className="font-normal normal-case text-emerald-500">
                (optional)
              </span>
            </legend>
            <p className="mb-3 text-xs text-emerald-600/90">
              Leave as “No hours” to submit without times. Manual times are
              saved as you enter them. Google needs a server Maps key — see
              below.
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["none", "No hours"],
                  ["manual", "Enter manually"],
                  ["google", "From Google Maps"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setHoursMode(id);
                    if (id === "none") resetHours();
                    setGoogleFetchMessage(null);
                  }}
                  className={
                    hoursMode === id
                      ? "rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {hoursMode === "manual" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="opens-at"
                    className="text-xs font-semibold text-emerald-700"
                  >
                    Opens
                  </label>
                  <input
                    id="opens-at"
                    type="time"
                    value={opensAt}
                    onChange={(e) => setOpensAt(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                <div>
                  <label
                    htmlFor="closes-at"
                    className="text-xs font-semibold text-emerald-700"
                  >
                    Closes
                  </label>
                  <input
                    id="closes-at"
                    type="time"
                    value={closesAt}
                    onChange={(e) => setClosesAt(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>
            ) : null}

            {hoursMode === "google" ? (
              <div className="mt-3 space-y-3">
                <div>
                  <label
                    htmlFor="google-place"
                    className="text-xs font-semibold text-emerald-700"
                  >
                    Google Place ID or Maps link
                  </label>
                  <textarea
                    id="google-place"
                    value={googlePlaceInput}
                    onChange={(e) => setGooglePlaceInput(e.target.value)}
                    rows={2}
                    className="mt-1 w-full resize-y rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    placeholder='e.g. ChIJ… or paste a maps.google.com link containing "!1sChIJ…"'
                  />
                  <button
                    type="button"
                    onClick={() => void fetchGoogleHours()}
                    disabled={googleFetchLoading}
                    className="mt-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {googleFetchLoading ? "Fetching…" : "Fetch hours from Google"}
                  </button>
                  {googleFetchMessage ? (
                    <p className="mt-2 text-xs text-emerald-700">
                      {googleFetchMessage}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[11px] leading-snug text-emerald-600/90">
                    Set{" "}
                    <code className="rounded bg-emerald-100/80 px-1">
                      GOOGLE_MAPS_SERVER_KEY
                    </code>{" "}
                    (or{" "}
                    <code className="rounded bg-emerald-100/80 px-1">
                      GOOGLE_MAPS_API_KEY
                    </code>
                    ) in{" "}
                    <code className="rounded bg-emerald-100/80 px-1">
                      .env.local
                    </code>{" "}
                    with the{" "}
                    <strong className="font-semibold text-emerald-800">
                      Places API
                    </strong>{" "}
                    enabled. The public browser key may be blocked for server
                    calls.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="g-opens"
                      className="text-xs font-semibold text-emerald-700"
                    >
                      Opens (editable)
                    </label>
                    <input
                      id="g-opens"
                      type="time"
                      value={opensAt}
                      onChange={(e) => setOpensAt(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="g-closes"
                      className="text-xs font-semibold text-emerald-700"
                    >
                      Closes (editable)
                    </label>
                    <input
                      id="g-closes"
                      type="time"
                      value={closesAt}
                      onChange={(e) => setClosesAt(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="hours-text"
                    className="text-xs font-semibold text-emerald-700"
                  >
                    Weekly text (from Google, editable)
                  </label>
                  <textarea
                    id="hours-text"
                    value={openingHoursText}
                    onChange={(e) => setOpeningHoursText(e.target.value)}
                    rows={4}
                    className="mt-1 w-full resize-y rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    placeholder="Populated after fetch, or type your own summary."
                  />
                </div>
              </div>
            ) : null}
          </fieldset>

          <div>
            <label
              htmlFor="place-note"
              className="text-xs font-semibold uppercase tracking-wide text-emerald-700"
            >
              Submitter note{" "}
              <span className="font-normal normal-case text-emerald-500">
                (optional)
              </span>
            </label>
            <textarea
              id="place-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-y rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="Anything we should know?"
              maxLength={2000}
            />
          </div>

          {message ? (
            <p
              className={
                message.type === "ok"
                  ? "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
                  : "rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
              }
            >
              {message.text}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </form>
      </main>
    </div>
  );
}
