"use client";

import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const METHOD = 3;
const DEFAULT_CITY = "Stockholm";
const DEFAULT_COUNTRY = "Sweden";
const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] as const;
type PrayerName = (typeof PRAYERS)[number];

const STORAGE_KEY = "halalhits_prayer_prefs_v1";

type PrayerPrefs = {
  /** `city` = Aladhan timingsByCity; `gps` = lat/lng when allowed, else Stockholm fallback */
  mode: "gps" | "city";
  city: string;
  country: string;
  /** Shown in the header; does not change API unless you use city mode. */
  nickname: string;
};

function defaultPrefs(): PrayerPrefs {
  return {
    mode: "gps",
    city: DEFAULT_CITY,
    country: DEFAULT_COUNTRY,
    nickname: "",
  };
}

function readPrefs(): PrayerPrefs {
  if (typeof window === "undefined") return defaultPrefs();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrefs();
    const p = JSON.parse(raw) as Partial<PrayerPrefs>;
    return {
      ...defaultPrefs(),
      ...p,
      mode: p.mode === "city" ? "city" : "gps",
      city: typeof p.city === "string" ? p.city : DEFAULT_CITY,
      country: typeof p.country === "string" ? p.country : DEFAULT_COUNTRY,
      nickname: typeof p.nickname === "string" ? p.nickname : "",
    };
  } catch {
    return defaultPrefs();
  }
}

function writePrefs(p: PrayerPrefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota */
  }
}

type AladhanData = {
  timings: Record<string, string>;
  date: {
    readable: string;
    gregorian: {
      date: string;
      weekday: { en: string };
    };
  };
  meta: { timezone: string };
};

function parseDdMmYyyy(s: string): { y: number; m: number; d: number } {
  const [day, month, year] = s.split("-").map(Number);
  return { y: year, m: month, d: day };
}

function prayerInstant(
  gregorianDdMmYyyy: string,
  timeHm: string,
  timeZone: string,
): Date {
  const { y, m, d } = parseDdMmYyyy(gregorianDdMmYyyy);
  const [hh, mm] = timeHm.split(":").map(Number);
  const wall = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
  return fromZonedTime(wall, timeZone);
}

function tomorrowDdMmYyyy(timeZone: string): string {
  const now = new Date();
  const ymd = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const noon = fromZonedTime(`${ymd}T12:00:00`, timeZone);
  return formatInTimeZone(addDays(noon, 1), timeZone, "dd-MM-yyyy");
}

function formatCountdown(target: Date, now: Date): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "Starting now";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `in ${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  if (hours > 0) {
    return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

async function fetchTimingsGeo(lat: number, lng: number, datePath?: string) {
  const path = datePath
    ? `https://api.aladhan.com/v1/timings/${encodeURIComponent(datePath)}?latitude=${lat}&longitude=${lng}&method=${METHOD}`
    : `https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lng}&method=${METHOD}`;
  const res = await fetch(path);
  if (!res.ok) throw new Error("Could not load prayer times.");
  const json = (await res.json()) as { data: AladhanData };
  return json.data;
}

async function fetchTimingsCity(
  city: string,
  country: string,
  datePath?: string,
) {
  const c = encodeURIComponent(city.trim());
  const co = encodeURIComponent(country.trim());
  const path = datePath
    ? `https://api.aladhan.com/v1/timingsByCity/${encodeURIComponent(datePath)}?city=${c}&country=${co}&method=${METHOD}`
    : `https://api.aladhan.com/v1/timingsByCity?city=${c}&country=${co}&method=${METHOD}`;
  const res = await fetch(path);
  if (!res.ok) throw new Error("Could not load prayer times for that city.");
  const json = (await res.json()) as { data: AladhanData };
  return json.data;
}

export default function PrayerPage() {
  const [prefs, setPrefs] = useState<PrayerPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timesSourceLabel, setTimesSourceLabel] = useState("");
  const [today, setToday] = useState<AladhanData | null>(null);
  const [tomorrowFajr, setTomorrowFajr] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());

  const [nickDraft, setNickDraft] = useState("");
  const [cityDraft, setCityDraft] = useState("");
  const [countryDraft, setCountryDraft] = useState("");
  const [prefsMessage, setPrefsMessage] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(readPrefs());
  }, []);

  useEffect(() => {
    if (prefs) {
      setNickDraft(prefs.nickname);
      setCityDraft(prefs.city);
      setCountryDraft(prefs.country);
    }
  }, [prefs]);

  const load = useCallback(async (p: PrayerPrefs) => {
    setLoading(true);
    setError(null);
    setPrefsMessage(null);

    const applyTimes = async (
      todayData: AladhanData,
      fetchTomorrow: (datePath: string) => Promise<AladhanData>,
    ) => {
      setToday(todayData);
      const tz = todayData.meta.timezone;
      const nextPath = tomorrowDdMmYyyy(tz);
      const d1 = await fetchTomorrow(nextPath);
      setTomorrowFajr(
        prayerInstant(d1.date.gregorian.date, d1.timings.Fajr, tz),
      );
    };

    try {
      if (p.mode === "city") {
        const city = p.city.trim() || DEFAULT_CITY;
        const country = p.country.trim() || DEFAULT_COUNTRY;
        setTimesSourceLabel(`${city}, ${country}`);
        const d0 = await fetchTimingsCity(city, country);
        await applyTimes(d0, (datePath) =>
          fetchTimingsCity(city, country, datePath),
        );
        return;
      }

      try {
        const geo = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            if (typeof navigator === "undefined" || !navigator.geolocation) {
              reject(new Error("no-geo"));
              return;
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              maximumAge: 300_000,
              timeout: 12_000,
            });
          },
        );
        const { latitude, longitude } = geo.coords;
        setTimesSourceLabel("Near your location");

        const geoLabelPromise = fetch(
          `/api/reverse-geocode?lat=${encodeURIComponent(String(latitude))}&lng=${encodeURIComponent(String(longitude))}`,
        )
          .then(async (r) => {
            if (!r.ok) return null;
            return (await r.json()) as { label?: string | null };
          })
          .catch(() => null);

        const d0 = await fetchTimingsGeo(latitude, longitude);
        await applyTimes(d0, (datePath) =>
          fetchTimingsGeo(latitude, longitude, datePath),
        );

        const geoJson = await geoLabelPromise;
        if (geoJson?.label) setTimesSourceLabel(geoJson.label);
      } catch {
        setTimesSourceLabel(`${DEFAULT_CITY}, ${DEFAULT_COUNTRY}`);
        const d0 = await fetchTimingsCity(DEFAULT_CITY, DEFAULT_COUNTRY);
        await applyTimes(d0, (datePath) =>
          fetchTimingsCity(DEFAULT_CITY, DEFAULT_COUNTRY, datePath),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setToday(null);
      setTomorrowFajr(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const prevTimesKey = useRef<string | null>(null);

  useEffect(() => {
    if (!prefs) return;
    const timesKey = `${prefs.mode}|${prefs.city.trim()}|${prefs.country.trim()}`;
    if (prevTimesKey.current === timesKey) return;
    prevTimesKey.current = timesKey;
    void load(prefs);
  }, [prefs, load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const headerLines = useMemo(() => {
    if (!prefs) return { primary: "", secondary: null as string | null };
    const nick = prefs.nickname.trim();
    if (nick) {
      return { primary: nick, secondary: timesSourceLabel };
    }
    return { primary: timesSourceLabel, secondary: null };
  }, [prefs, timesSourceLabel]);

  const prayerRows = useMemo(() => {
    if (!today) return [];
    const tz = today.meta.timezone;
    const dateStr = today.date.gregorian.date;
    return PRAYERS.map((name) => ({
      name,
      time: today.timings[name] ?? "—",
      instant: prayerInstant(dateStr, today.timings[name] ?? "00:00", tz),
    }));
  }, [today]);

  const { nextPrayer, nextInstant } = useMemo(() => {
    if (!today || prayerRows.length === 0 || !tomorrowFajr) {
      return {
        nextPrayer: null as PrayerName | null,
        nextInstant: null as Date | null,
      };
    }
    const t = now.getTime();
    for (const row of prayerRows) {
      if (row.instant.getTime() > t) {
        return { nextPrayer: row.name, nextInstant: row.instant };
      }
    }
    return { nextPrayer: "Fajr" as const, nextInstant: tomorrowFajr };
  }, [today, prayerRows, tomorrowFajr, now]);

  const isFriday = today?.date.gregorian.weekday.en === "Friday";
  const jummahTime = today?.timings.Dhuhr;

  function persistAndReload(next: PrayerPrefs) {
    writePrefs(next);
    setPrefs(next);
  }

  function saveNickname() {
    if (!prefs) return;
    const next = { ...prefs, nickname: nickDraft.trim() };
    writePrefs(next);
    setPrefs(next);
    setPrefsMessage("Saved name.");
    window.setTimeout(() => setPrefsMessage(null), 2500);
  }

  function applyCityMode() {
    if (!prefs) return;
    const city = cityDraft.trim();
    const country = countryDraft.trim();
    if (!city || !country) {
      setPrefsMessage("Enter both city and country.");
      window.setTimeout(() => setPrefsMessage(null), 3000);
      return;
    }
    persistAndReload({
      ...prefs,
      mode: "city",
      city,
      country,
    });
  }

  function useGpsMode() {
    if (!prefs) return;
    persistAndReload({ ...prefs, mode: "gps" });
  }

  function useCityMode() {
    if (!prefs) return;
    persistAndReload({
      ...prefs,
      mode: "city",
      city: cityDraft.trim() || prefs.city || DEFAULT_CITY,
      country: countryDraft.trim() || prefs.country || DEFAULT_COUNTRY,
    });
  }

  return (
    <div className="min-h-dvh bg-emerald-50 text-emerald-950">
      <header className="border-b border-emerald-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto max-w-lg px-4 py-4 sm:py-5">
          <h1 className="text-xl font-bold tracking-tight text-emerald-800 sm:text-2xl">
            Prayer times
          </h1>
          <p className="mt-1 text-sm font-medium text-emerald-800">
            {headerLines.primary || "…"}
          </p>
          {headerLines.secondary ? (
            <p className="mt-0.5 text-xs text-emerald-600/90">
              Times for {headerLines.secondary}
            </p>
          ) : null}
          {today ? (
            <p className="mt-1 text-xs text-emerald-600/90">
              {today.date.readable} · MWL (method {METHOD})
            </p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-28 pt-4 sm:pt-6">
        {loading || !prefs ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
              aria-hidden
            />
            <p className="text-sm font-medium text-emerald-700">
              Getting location &amp; times…
            </p>
          </div>
        ) : error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800">
            {error}
          </p>
        ) : today && nextInstant && nextPrayer ? (
          <>
            <section className="mb-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm ring-1 ring-emerald-100/60">
              <h2 className="text-sm font-semibold text-emerald-900">
                Location
              </h2>
              <p className="mt-1 text-xs text-emerald-600/90">
                Optional nickname is saved on this device. With GPS, we try to
                show a place name automatically (OpenStreetMap). Use city mode
                to pin times to a specific city.
              </p>

              <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-emerald-600">
                Your name for this place
              </label>
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  type="text"
                  value={nickDraft}
                  onChange={(e) => setNickDraft(e.target.value)}
                  placeholder='e.g. "Home", "Masjid"'
                  className="min-w-[12rem] flex-1 rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  maxLength={80}
                />
                <button
                  type="button"
                  onClick={saveNickname}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  Save name
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-emerald-100 pt-4">
                <button
                  type="button"
                  onClick={useGpsMode}
                  className={
                    prefs.mode === "gps"
                      ? "rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                  }
                >
                  Use GPS
                </button>
                <button
                  type="button"
                  onClick={useCityMode}
                  className={
                    prefs.mode === "city"
                      ? "rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                  }
                >
                  Use city
                </button>
              </div>

              {prefs.mode === "city" ? (
                <div className="mt-3 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold text-emerald-700">
                        City
                      </label>
                      <input
                        type="text"
                        value={cityDraft}
                        onChange={(e) => setCityDraft(e.target.value)}
                        className="mt-0.5 w-full rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                        placeholder="Stockholm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-emerald-700">
                        Country
                      </label>
                      <input
                        type="text"
                        value={countryDraft}
                        onChange={(e) => setCountryDraft(e.target.value)}
                        className="mt-0.5 w-full rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                        placeholder="Sweden"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={applyCityMode}
                    className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 sm:w-auto sm:px-6"
                  >
                    Load times for this city
                  </button>
                </div>
              ) : null}

              {prefsMessage ? (
                <p className="mt-2 text-xs font-medium text-emerald-700">
                  {prefsMessage}
                </p>
              ) : null}
            </section>

            {isFriday && jummahTime ? (
              <section className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm ring-1 ring-emerald-100/60">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-xl"
                  aria-hidden
                >
                  🕌
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                    Jummah
                  </p>
                  <p className="text-lg font-bold text-emerald-900">{jummahTime}</p>
                  <p className="text-xs text-emerald-600/90">
                    Often observed at Dhuhr; mosque schedules vary.
                  </p>
                </div>
              </section>
            ) : null}

            <ul className="flex flex-col gap-3">
              {prayerRows.map((row) => {
                const isNext = row.name === nextPrayer;
                const nextIsTomorrowFajr =
                  nextPrayer === "Fajr" && nextInstant === tomorrowFajr;
                const showTomorrowFajrTime =
                  isNext && nextIsTomorrowFajr && today;

                const displayTime = showTomorrowFajrTime
                  ? formatInTimeZone(nextInstant, today.meta.timezone, "HH:mm")
                  : row.time;

                return (
                  <li key={row.name}>
                    <article
                      className={
                        isNext
                          ? "rounded-2xl border-2 border-emerald-500 bg-emerald-600 p-4 text-white shadow-md ring-2 ring-emerald-400/40"
                          : "rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm ring-1 ring-emerald-100/60"
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h2
                          className={
                            isNext
                              ? "text-lg font-semibold text-white"
                              : "text-lg font-semibold text-emerald-900"
                          }
                        >
                          {row.name}
                        </h2>
                        <span
                          className={
                            isNext
                              ? "text-xl font-semibold tabular-nums text-white"
                              : "text-xl font-semibold tabular-nums text-emerald-800"
                          }
                        >
                          {displayTime}
                        </span>
                      </div>
                      {showTomorrowFajrTime ? (
                        <p
                          className={
                            isNext ? "mt-1 text-xs text-emerald-100" : undefined
                          }
                        >
                          Tomorrow
                        </p>
                      ) : null}
                      {isNext ? (
                        <p
                          className={
                            isNext
                              ? "mt-2 text-sm font-medium text-emerald-50"
                              : undefined
                          }
                        >
                          {formatCountdown(nextInstant, now)}
                        </p>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </main>
    </div>
  );
}
