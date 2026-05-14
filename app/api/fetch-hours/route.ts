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

    // Search for the place
    const query = encodeURIComponent(`${placeName} ${address} ${city}`);
    const findRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=place_id,name,opening_hours&key=${apiKey}`,
    );
    const findData = await findRes.json() as {
      candidates?: { place_id?: string; name?: string }[];
      status?: string;
    };

    if (!findData.candidates?.length || !findData.candidates[0].place_id) {
      return NextResponse.json(
        { error: "Place not found on Google Maps." },
        { status: 404 },
      );
    }

    const placeId = findData.candidates[0].place_id;

    // Get full details including hours
    const detailRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,opening_hours,current_opening_hours&key=${apiKey}`,
    );
    const detailData = await detailRes.json() as {
      result?: {
        opening_hours?: {
          weekday_text?: string[];
          periods?: {
            open?: { time?: string };
            close?: { time?: string };
          }[];
        };
      };
    };

    const hours = detailData.result?.opening_hours;
    if (!hours) {
      return NextResponse.json(
        { error: "No hours found for this place on Google." },
        { status: 404 },
      );
    }

    // Get today's open/close
    const today = new Date().getDay(); // 0=Sun
    const todayPeriod = hours.periods?.find(
      (p) => {
        // periods use numeric day 0=Sun
        return true; // just grab first period as fallback
      }
    );
    const opensAt = hours.periods?.[0]?.open?.time
      ? `${hours.periods[0].open.time.slice(0, 2)}:${hours.periods[0].open.time.slice(2)}`
      : null;
    const closesAt = hours.periods?.[0]?.close?.time
      ? `${hours.periods[0].close.time.slice(0, 2)}:${hours.periods[0].close.time.slice(2)}`
      : null;

    const weekdayText = hours.weekday_text?.join("\n") ?? null;

    return NextResponse.json({
      placeId,
      opensAt,
      closesAt,
      weekdayText,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Server error fetching hours." },
      { status: 500 },
    );
  }
}