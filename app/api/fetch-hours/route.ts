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

    const query = encodeURIComponent(`${placeName} ${address} ${city} Sweden`);
    const searchRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}`,
    );
    const searchData = await searchRes.json() as {
      results?: {
        place_id?: string;
        name?: string;
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
        rating?: number;
        user_ratings_total?: number;
        price_level?: number;
      }[];
      status?: string;
      error_message?: string;
    };

    if (searchData.error_message) {
      return NextResponse.json({ error: `Google API error: ${searchData.error_message}` }, { status: 500 });
    }

    if (!searchData.results?.length || !searchData.results[0].place_id) {
      return NextResponse.json({ error: `Place not found. Status: ${searchData.status ?? "UNKNOWN"}` }, { status: 404 });
    }

    const topResult = searchData.results[0];
    const placeId = topResult.place_id!;

    const detailRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,opening_hours,formatted_phone_number,website,rating,user_ratings_total,price_level,url,types&key=${apiKey}`,
    );
    const detailData = await detailRes.json() as {
      result?: {
        name?: string;
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
        opening_hours?: {
          weekday_text?: string[];
          periods?: {
            open?: { day?: number; time?: string };
            close?: { day?: number; time?: string };
          }[];
        };
        formatted_phone_number?: string;
        website?: string;
        rating?: number;
        user_ratings_total?: number;
        price_level?: number;
        url?: string;
        types?: string[];
      };
      error_message?: string;
    };

    if (detailData.error_message) {
      return NextResponse.json({ error: `Google API error: ${detailData.error_message}` }, { status: 500 });
    }

    const d = detailData.result;
    if (!d) {
      return NextResponse.json({ error: "No details returned." }, { status: 404 });
    }

    const mondayPeriod = d.opening_hours?.periods?.find(p => p.open?.day === 1);
    const firstPeriod = mondayPeriod ?? d.opening_hours?.periods?.[0];

    function formatTime(t?: string): string | null {
      if (!t || t.length < 4) return null;
      return `${t.slice(0, 2)}:${t.slice(2)}`;
    }

    return NextResponse.json({
      placeId,
      name: d.name ?? null,
      formattedAddress: d.formatted_address ?? topResult.formatted_address ?? null,
      lat: d.geometry?.location?.lat ?? topResult.geometry?.location?.lat ?? null,
      lng: d.geometry?.location?.lng ?? topResult.geometry?.location?.lng ?? null,
      opensAt: formatTime(firstPeriod?.open?.time),
      closesAt: formatTime(firstPeriod?.close?.time),
      weekdayText: d.opening_hours?.weekday_text?.join("\n") ?? null,
      phone: d.formatted_phone_number ?? null,
      website: d.website ?? null,
      googleRating: d.rating ?? topResult.rating ?? null,
      googleReviewCount: d.user_ratings_total ?? topResult.user_ratings_total ?? null,
      googleMapsUrl: d.url ?? null,
      priceLevel: d.price_level ?? topResult.price_level ?? null,
      types: d.types ?? [],
    });

  } catch (e) {
    console.error("fetch-hours error:", e);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}