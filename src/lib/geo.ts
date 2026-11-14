// Worldwide place data for the profile location pickers.
//
// Two published datasets, both read at build time and never typed by hand:
//   world-countries      — every UN-recognised country, its ISO code and the
//                          region/subregion it belongs to (250 entries)
//   country-state-city   — the first-level divisions (states, provinces,
//                          prefectures, departments…) and the cities recorded
//                          inside them
//
// Only the server reads this module: the browser asks /api/geo for the one
// slice it needs, so a couple of megabytes of geography never rides along with
// the profile form.
import countries from "world-countries";
import { State, City } from "country-state-city";

export type RegionRow = { name: string; countries: number };
export type CountryRow = { code: string; name: string; region: string };
export type StateRow = { code: string; name: string };
export type CityRow = { name: string };

// world-countries files the Americas under one region and the Antarctic under
// another; the picker asks for the seven names people recognise.
function continentOf(c: (typeof countries)[number]): string {
  if (c.region === "Antarctic") return "Antarctica";
  if (c.region === "Americas") return c.subregion === "South America" ? "South America" : "North America";
  return c.region;
}

const ALL: CountryRow[] = countries
  .map((c) => ({ code: c.cca2, name: c.name.common, region: continentOf(c) }))
  .filter((c) => /^[A-Z]{2}$/.test(c.code))
  .sort((a, b) => a.name.localeCompare(b.name));

export function listRegions(): RegionRow[] {
  const names: string[] = [];
  ALL.forEach((c) => { if (!names.includes(c.region)) names.push(c.region); });
  return names
    .map((name) => ({ name, countries: ALL.filter((c) => c.region === name).length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listCountries(region?: string | null): CountryRow[] {
  return region ? ALL.filter((c) => c.region === region) : ALL;
}

export function regionOf(code: string): string | null {
  return ALL.find((c) => c.code === code)?.region ?? null;
}

export function listStates(code: string): StateRow[] {
  return (State.getStatesOfCountry(code) || [])
    .map((s) => ({ code: s.isoCode, name: s.name }))
    .filter((s) => !!s.code && !!s.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function dedupeNames(rows: { name: string }[]): CityRow[] {
  const seen: string[] = [];
  return rows
    .map((c) => ({ name: c.name }))
    .filter((c) => {
      if (!c.name || seen.includes(c.name.toLowerCase())) return false;
      seen.push(c.name.toLowerCase());
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listCities(code: string, stateCode: string): CityRow[] {
  return dedupeNames((City.getCitiesOfState(code, stateCode) || []) as { name: string }[]);
}

// A city asked for without a state is searched across the whole country, so a
// request that skips the optional level is still answered instead of refused.
function cityPool(code: string, stateCode: string | null): CityRow[] {
  const rows = stateCode
    ? City.getCitiesOfState(code, stateCode)
    : City.getCitiesOfCountry(code);
  return dedupeNames((rows || []) as { name: string }[]);
}

export type Place = {
  region: string;
  country: string;
  country_code: string;
  state: string | null;
  city: string | null;
};

/**
 * Turns the codes a picker submits back into names from the same dataset, so
 * whatever reaches the database is a real place rather than whatever a tab in
 * the background happened to type. Returns null when the country is unknown,
 * or when a state/city is not part of the country it claims to belong to.
 */
export function resolvePlace(input: {
  country_code?: string | null;
  state_code?: string | null;
  city?: string | null;
}): Place | null {
  const code = (input.country_code || "").trim().toUpperCase();
  if (!code) return null;
  const country = ALL.find((c) => c.code === code);
  if (!country) return null;

  const place: Place = { region: country.region, country: country.name, country_code: code, state: null, city: null };

  const stateCode = (input.state_code || "").trim().toUpperCase();
  if (stateCode) {
    const state = listStates(code).find((s) => s.code === stateCode);
    if (!state) return null;
    place.state = state.name;
  }

  const city = (input.city || "").trim();
  if (city) {
    const known = cityPool(code, stateCode || null).find((c) => c.name.toLowerCase() === city.toLowerCase());
    if (!known) return null;
    place.city = known.name;
  }

  return place;
}

/** The sentence a profile prints, without repeating a name that is both city and state. */
export function placeLine(place: Place | null): string {
  if (!place) return "";
  const parts = [place.city, place.state, place.country].filter(Boolean) as string[];
  return parts.filter((p, i) => i === 0 || p.toLowerCase() !== parts[i - 1].toLowerCase()).join(", ");
}
