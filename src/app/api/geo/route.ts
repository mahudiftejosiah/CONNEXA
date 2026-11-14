import { NextResponse } from "next/server";
import { listCities, listCountries, listRegions, listStates } from "@/lib/geo";

// One route answering each level of the profile's place picker. The whole
// world dataset stays on the server and only the slice being looked at is
// sent down — a browser opening that form should not have to carry 250
// countries plus every city on earth.
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" };
const json = (body: unknown) => NextResponse.json(body, { headers });

const CODE = /^[A-Z]{2}$/;
const DIVISION = /^[A-Z0-9-]{1,6}$/;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const level = params.get("level") || "world";

  if (level === "world") {
    return json({ regions: listRegions(), countries: listCountries() });
  }

  if (level === "countries") {
    const region = params.get("region");
    return json(listCountries(region && region !== "all" ? region : null));
  }

  if (level === "states") {
    const country = (params.get("country") || "").toUpperCase();
    if (!CODE.test(country)) return NextResponse.json({ error: "Ask with a two-letter country code." }, { status: 400 });
    return json(listStates(country));
  }

  if (level === "cities") {
    const country = (params.get("country") || "").toUpperCase();
    const state = (params.get("state") || "").toUpperCase();
    if (!CODE.test(country) || !DIVISION.test(state)) {
      return NextResponse.json({ error: "Ask with a country code and a division code." }, { status: 400 });
    }
    return json(listCities(country, state));
  }

  return NextResponse.json({ error: "Level must be world, countries, states or cities." }, { status: 400 });
}
