import { NextResponse } from "next/server";

const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";

type NominatimJson = {
  display_name?: string;
  address?: Record<string, string | undefined>;
};

function pickLocality(a: Record<string, string | undefined>): string | null {
  const keys = [
    "city",
    "town",
    "village",
    "municipality",
    "hamlet",
    "suburb",
    "city_district",
    "county",
  ] as const;
  for (const k of keys) {
    const v = a[k];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function labelFromNominatim(data: NominatimJson): string | null {
  const a = data.address;
  if (a) {
    const locality = pickLocality(a);
    const country = a.country?.trim();
    if (locality && country) return `${locality}, ${country}`;
    if (country) return country;
  }
  if (data.display_name) {
    const parts = data.display_name.split(",").map((s) => s.trim());
    if (parts.length >= 2) return `${parts[0]}, ${parts[parts.length - 1]}`;
    return parts[0] ?? null;
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  const lat = latRaw === null ? NaN : Number(latRaw);
  const lng = lngRaw === null ? NaN : Number(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Out of range" }, { status: 400 });
  }

  const url = new URL(NOMINATIM);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "10");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": "HalalHits/1.0 (prayer times; reverse geocode)",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { label: null, error: "Geocoder unavailable" },
        { status: 200 },
      );
    }

    const data = (await res.json()) as NominatimJson;
    const label = labelFromNominatim(data);
    return NextResponse.json({ label });
  } catch {
    return NextResponse.json({ label: null }, { status: 200 });
  }
}
