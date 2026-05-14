import { NextResponse } from "next/server";

const PLACE_DETAILS =
  "https://maps.googleapis.com/maps/api/place/details/json";

type Period = {
  open: { day: number; time: string };
  close?: { day: number; time: string };
};

function googleTimeToHHMM(t: string): string | null {
  if (!/^\d{3,4}$/.test(t)) return null;
  const padded = t.padStart(4, "0");
  const h = padded.slice(0, 2);
  const m = padded.slice(2, 4);
  return `${h}:${m}`;
}

function extractGooglePlaceId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^ChIJ[A-Za-z0-9_-]{20,}$/.test(s)) return s;
  const fromQ = s.match(/[?&]place_id=([^&]+)/);
  if (fromQ) return decodeURIComponent(fromQ[1]);
  const bang = s.match(/!1s(ChIJ[A-Za-z0-9_-]{20,})/);
  if (bang) return bang[1];
  const anywhere = s.match(/(ChIJ[A-Za-z0-9_-]{20,})/);
  return anywhere ? anywhere[1] : null;
}

export async function POST(request: Request) {
  let body: { placeIdOrUrl?: string };
  try {
    body = (await request.json()) as { placeIdOrUrl?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = body.placeIdOrUrl?.trim() ?? "";
  const placeId = extractGooglePlaceId(raw);
  if (!placeId) {
    return NextResponse.json(
      {
        error:
          "Could not find a Google Place ID. Paste a Place ID (starts with ChIJ…) or a Google Maps link that contains one.",
      },
      { status: 400 },
    );
  }

  const key =
    process.env.GOOGLE_MAPS_SERVER_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim();

  if (!key) {
    return NextResponse.json(
      {
        error:
          "Server has no Google Maps key. Set GOOGLE_MAPS_SERVER_KEY (recommended) or GOOGLE_MAPS_API_KEY in .env.local, enable Places API, and restart.",
      },
      { status: 503 },
    );
  }

  const url = new URL(PLACE_DETAILS);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "opening_hours,url,name");
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = (await res.json()) as {
      status: string;
      error_message?: string;
      result?: {
        name?: string;
        url?: string;
        opening_hours?: {
          weekday_text?: string[];
          periods?: Period[];
        };
      };
    };

    if (data.status !== "OK" || !data.result) {
      return NextResponse.json(
        {
          error:
            data.error_message ||
            data.status ||
            "Google Places did not return opening hours for this place.",
        },
        { status: 422 },
      );
    }

    const oh = data.result.opening_hours;
    const weekdayText = oh?.weekday_text?.join("\n") ?? "";
    const periods = oh?.periods ?? [];
    const today = new Date().getDay();

    let opensAt: string | null = null;
    let closesAt: string | null = null;

    const todays = periods.filter((p) => p.open?.day === today);
    const pick = todays[0];
    if (pick?.open?.time) {
      opensAt = googleTimeToHHMM(pick.open.time);
      if (pick.close?.time) {
        closesAt = googleTimeToHHMM(pick.close.time);
      }
    }

    return NextResponse.json({
      placeId,
      placeName: data.result.name ?? null,
      opensAt,
      closesAt,
      openingHoursText: weekdayText || null,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach Google Places." },
      { status: 502 },
    );
  }
}
