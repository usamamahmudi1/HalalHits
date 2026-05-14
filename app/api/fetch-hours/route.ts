import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { placeName, address, city } = await req.json() as {
      placeName: string;
      address: string;
      city: string;
    };

    const apiKey =
      process.env.GOOGLE_MAPS_SERVER_KEY ??
      process.env.GOOGLE_MAPS_API_KEY ??
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ??
      "";

    if (!apiKey) {
      return NextResponse.json(
        { error: "No Google Maps API key configured." },
        { status: 500 },
      );
    }

    // Step 1 — Text search (more reliable than findplacefromtext)
    const query = encodeURIComponent(`${placeName} ${address} ${city} Sweden`);
    const searchRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}`,
    );
    const searchData = await searchRes.json() as {
      results?: { place_id?: string; name?: string }[];
      status?: string;
      error_message?: string;
    };

    if (searchData.error_message) {
      return NextResponse.json(
        { error: `Google API error: ${searchData.error_message}` },
        { status: 500 },
      );
    }

    if (!searchData.results?.length || !searchData.results[0].place_id) {
      return NextResponse.json(
        { error: `Place not found. Google status: ${searchData.status ?? "UNKNOWN"}` },
        { status: 404 },
      );
    }

    const placeId = searchData.results[0].place_id;

    // Step 2 — Get place details with opening hours
    const detailRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,opening_hours&key=${apiKey}`,
    );
    const detailData = await detailRes.json() as {
      result?: {
        opening_hours?: {
          weekday_text?: string[];
          periods?: {
            open?: { day?: number; time?: string };
            close?: { day?: number; time?: string };
          }[];
        };
      };
      error_message?: string;
    };

    if (detailData.error_message) {
      return NextResponse.json(
        { error: `Google API error: ${detailData.error_message}` },
        { status: 500 },
      );
    }

    const hours = detailData.result?.opening_hours;
    if (!hours) {
      return NextResponse.json(
        { error: "Place found but no opening hours on Google." },
        { status: 404 },
      );
    }

    // Get Monday period as a representative open/close (day 1 = Monday)
    const mondayPeriod = hours.periods?.find((p) => p.open?.day === 1);
    const firstPeriod = mondayPeriod ?? hours.periods?.[0];

    function formatTime(t?: string): string | null {
      if (!t || t.length < 4) return null;
      return `${t.slice(0, 2)}:${t.slice(2)}`;
    }

    const opensAt = formatTime(firstPeriod?.open?.time);
    const closesAt = formatTime(firstPeriod?.close?.time);
    const weekdayText = hours.weekday_text?.join("\n") ?? null;

    return NextResponse.json({ placeId, opensAt, closesAt, weekdayText });

  } catch (e) {
    console.error("fetch-hours error:", e);
    return NextResponse.json(
      { error: "Server error fetching hours." },
      { status: 500 },
    );
  }
}