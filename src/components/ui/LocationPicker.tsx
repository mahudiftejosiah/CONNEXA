"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, MapPin, X } from "lucide-react";

type RegionRow = { name: string; countries: number };
type CountryRow = { code: string; name: string; region: string };
type StateRow = { code: string; name: string };
type CityRow = { name: string };

export type PlaceSelection = {
  region: string | null;
  country: string | null;
  country_code: string | null;
  state: string | null;
  state_code: string | null;
  city: string | null;
};

export type PlaceSaved = {
  region?: string | null;
  country?: string | null;
  country_code?: string | null;
  state?: string | null;
  city?: string | null;
};

// A list this long is paginated in the box itself; the search field is what
// brings the rest of it back into reach.
const SHOWN = 100;

export function LocationPicker({ saved, onChange }: { saved: PlaceSaved; onChange: (p: PlaceSelection) => void }) {
  const [regions, setRegions] = useState<RegionRow[] | null>(null);
  const [countries, setCountries] = useState<CountryRow[] | null>(null);
  const [states, setStates] = useState<StateRow[] | null>(null);
  const [cities, setCities] = useState<CityRow[] | null>(null);
  const [worldError, setWorldError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const [region, setRegion] = useState<string | null>(saved.region || null);
  const [country, setCountry] = useState<string | null>(saved.country || null);
  const [countryCode, setCountryCode] = useState<string | null>(saved.country_code || null);
  const [state, setState] = useState<string | null>(saved.state || null);
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(saved.city || null);

  // The profile stores names; the lists are keyed by code, so the saved state
  // is matched back to its code as soon as the country's list arrives.
  useEffect(() => {
    if (!states) return;
    const found = saved.state ? states.find((s) => s.name.toLowerCase() === saved.state!.toLowerCase()) : undefined;
    setStateCode(found ? found.code : null);
  }, [states, saved.state]);

  useEffect(() => {
    let alive = true;
    setWorldError(null);
    fetch("/api/geo?level=world")
      .then(async (res) => {
        const body = await res.json();
        if (!alive) return;
        if (!res.ok) { setWorldError(body.error || "The place list could not be loaded."); return; }
        setWorldError(null);
        setRegions(body.regions as RegionRow[]);
        setCountries(body.countries as CountryRow[]);
      })
      .catch(() => { if (alive) setWorldError("The place list could not be loaded. Check your connection."); });
    return () => { alive = false; };
  }, [retry]);

  useEffect(() => {
    if (!countryCode) { setStates(null); setStateCode(null); return; }
    let alive = true;
    setStates(null);
    fetch(`/api/geo?level=states&country=${countryCode}`)
      .then(async (res) => {
        const body = await res.json();
        if (!alive) return;
        setStates(res.ok ? (body as StateRow[]) : []);
      })
      .catch(() => { if (alive) setStates([]); });
    return () => { alive = false; };
  }, [countryCode]);

  useEffect(() => {
    if (!countryCode || !stateCode) { setCities(null); return; }
    let alive = true;
    setCities(null);
    fetch(`/api/geo?level=cities&country=${countryCode}&state=${stateCode}`)
      .then(async (res) => {
        const body = await res.json();
        if (!alive) return;
        setCities(res.ok ? (body as CityRow[]) : []);
      })
      .catch(() => { if (alive) setCities([]); });
    return () => { alive = false; };
  }, [countryCode, stateCode]);

  // Anything the parent is told is also what the server will re-check, so the
  // names ride along with the codes rather than replacing them.
  function emit(next: Partial<PlaceSelection>) {
    const merged: PlaceSelection = { region, country, country_code: countryCode, state, state_code: stateCode, city, ...next };
    onChange(merged);
  }

  function pickRegion(name: string | null) {
    setRegion(name);
    if (country && name && countries) {
      const still = countries.find((c) => c.name === country);
      if (still && still.region !== name) {
        setCountry(null); setCountryCode(null); setState(null); setStateCode(null); setCity(null);
        emit({ region: name, country: null, country_code: null, state: null, state_code: null, city: null });
        return;
      }
    }
    emit({ region: name });
  }

  function pickCountry(row: CountryRow | null) {
    setRegion(row ? row.region : null);
    setCountry(row ? row.name : null);
    setCountryCode(row ? row.code : null);
    setState(null); setStateCode(null); setCity(null);
    setStates(null); setCities(null);
    emit({ region: row ? row.region : null, country: row ? row.name : null, country_code: row ? row.code : null, state: null, state_code: null, city: null });
  }

  function pickState(row: StateRow | null) {
    setState(row ? row.name : null);
    setStateCode(row ? row.code : null);
    setCity(null);
    setCities(null);
    emit({ state: row ? row.name : null, state_code: row ? row.code : null, city: null });
  }

  function pickCity(row: CityRow | null) {
    setCity(row ? row.name : null);
    emit({ city: row ? row.name : null });
  }

  const regionNames = useMemo(() => (regions || []).map((r) => ({ name: r.name })), [regions]);
  const countryRows = useMemo(
    () => (countries || []).filter((c) => !region || c.region === region),
    [countries, region]
  );

  if (worldError) {
    return (
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <MapPin className="w-5 h-5 flex-none" style={{ color: "var(--text-secondary)" }} />
        <p className="text-sm flex-1 min-w-[10rem]" style={{ color: "var(--text-secondary)" }}>{worldError}</p>
        <button type="button" onClick={() => setRetry((n) => n + 1)} className="btn-ghost text-sm">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Combo
          label="Region of the world"
          ariaLabel="Region"
          placeholder="Search all regions…"
          value={region}
          items={regionNames}
          labelOf={(r) => r.name}
          loading={!regions}
          emptyHint="No region matches that."
          onClear={() => pickCountry(null)}
          onPick={(r) => pickRegion(r ? r.name : null)}
          note={region && countries ? `${countries.filter((c) => c.region === region).length} countries` : undefined}
        />
        <Combo
          label="Country"
          ariaLabel="Country"
          placeholder={region ? `Search countries in ${region}…` : "Search every country…"}
          value={country}
          items={countryRows}
          labelOf={(c) => c.name}
          loading={!countries}
          emptyHint={region ? `No country in ${region} matches that.` : "No country matches that."}
          onClear={() => pickCountry(null)}
          onPick={(c) => pickCountry(c)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Combo
          label="State, province or territory"
          ariaLabel="State or province"
          placeholder={countryCode ? "Start typing to filter…" : "Choose a country first"}
          value={state}
          items={states || []}
          labelOf={(s) => s.name}
          loading={!countryCode ? false : states === null}
          disabled={!countryCode}
          emptyHint={states && states.length === 0 ? `${country} has no first-level areas in this list.` : "No area here matches that."}
          onClear={() => pickState(null)}
          onPick={(s) => pickState(s)}
          note="Optional"
        />
        <Combo
          label="City or local area"
          ariaLabel="City"
          placeholder={stateCode ? "Start typing to filter…" : "Choose an area first"}
          value={city}
          items={cities || []}
          labelOf={(c) => c.name}
          loading={!!stateCode && cities === null}
          disabled={!stateCode}
          emptyHint={cities && cities.length === 0 ? `No cities are recorded for ${state}.` : "No city there matches that."}
          onClear={() => pickCity(null)}
          onPick={(c) => pickCity(c)}
          note="Optional"
        />
      </div>
    </div>
  );
}

interface ComboProps<T> {
  label: string;
  ariaLabel: string;
  placeholder: string;
  value: string | null;
  items: T[];
  labelOf: (item: T) => string;
  onPick: (item: T | null) => void;
  onClear: () => void;
  loading?: boolean;
  disabled?: boolean;
  emptyHint: string;
  note?: string;
}

// One searchable dropdown. A native <select> cannot be typed into across 250
// countries, and a plain text box cannot be validated, so the field carries
// both: free typing that filters, and a list that decides.
function Combo<T>({ label, ariaLabel, placeholder, value, items, labelOf, onPick, onClear, loading, disabled, emptyHint, note }: ComboProps<T>) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const needle = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return items;
    return items.filter((i) => labelOf(i).toLowerCase().includes(needle));
  }, [items, needle, labelOf]);
  const shown = useMemo(() => matches.slice(0, SHOWN), [matches]);

  useEffect(() => { setActive(0); }, [query, open]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  function choose(item: T | null) {
    onPick(item);
    setQuery("");
    setOpen(false);
    input.current?.blur();
  }

  function key(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((a) => (e.key === "ArrowDown" ? Math.min(a + 1, shown.length - 1) : Math.max(a - 1, 0)));
      return;
    }
    if (e.key === "Enter") {
      if (open && shown[active]) { e.preventDefault(); choose(shown[active]); }
      else if (open && matches.length === 0) { e.preventDefault(); }
    }
  }

  return (
    <div className="relative" ref={box}>
      <div className="flex items-baseline justify-between gap-2">
        <label className="label" htmlFor={`place-${ariaLabel}`}>{label}</label>
        {note && <span className="text-[11px] mb-1" style={{ color: "var(--text-secondary)" }}>{note}</span>}
      </div>

      <div className="relative">
        <input
          id={`place-${ariaLabel}`}
          ref={input}
          role="combobox"
          aria-expanded={open}
          aria-controls={`place-list-${ariaLabel}`}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          type="text"
          disabled={disabled}
          autoComplete="off"
          value={open ? query : (value ?? "")}
          placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={key}
          className="input pr-16"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-secondary)" }} />}
          {!loading && value && !open && (
            <button type="button" onClick={onClear} aria-label={`Clear ${label}`}
              className="p-1 rounded-lg hover:bg-[var(--border)]">
              <X className="w-3.5 h-3.5" style={{ color: "var(--text-secondary)" }} />
            </button>
          )}
          <ChevronDown className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
        </span>
      </div>

      {value && !open && (
        <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "rgb(var(--a-800))" }}>
          <Check className="w-3 h-3" /> {value}
        </p>
      )}

      {open && !disabled && (
        <ul id={`place-list-${ariaLabel}`} role="listbox" aria-label={`${label} options`}
          className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border shadow-lg py-1"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
          {loading ? (
            <li className="px-3 py-2 text-sm animate-pulse" style={{ color: "var(--text-secondary)" }}>Loading places…</li>
          ) : shown.length === 0 ? (
            <li className="px-3 py-2 text-sm" style={{ color: "var(--text-secondary)" }}>{emptyHint}</li>
          ) : (
            shown.map((item, i) => {
              const text = labelOf(item);
              const selected = text === value;
              return (
                <li key={text} role="option" aria-selected={selected}>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); choose(item); }}
                    className={"w-full text-left px-3 py-2 text-sm flex items-center gap-2 " + (i === active ? "bg-[var(--border)]" : "")}
                    style={{ color: selected ? "rgb(var(--a-800))" : "var(--text-primary)" }}
                    onMouseEnter={() => setActive(i)}>
                    <span className="flex-1 truncate">{text}</span>
                    {selected && <Check className="w-3.5 h-3.5 flex-none" />}
                  </button>
                </li>
              );
            })
          )}
          {matches.length > shown.length && (
            <li className="px-3 py-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              {matches.length - shown.length} more — keep typing to narrow it down.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
