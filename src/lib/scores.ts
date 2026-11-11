export type ScoreTeam = { name: string; abbr: string; color: string | null };

export interface ScoreMatch {
  id: string;
  home: ScoreTeam;
  away: ScoreTeam;
  homeScore: string | null;
  awayScore: string | null;
  /** What the site itself shows in the result column: "31'", "2Q", "HT", "FT", … */
  status: string;
  live: boolean;
  finished: boolean;
  /** Kick-off in epoch ms, or null when the feed did not send a time. */
  startsAt: number | null;
}

export interface ScoreGroup {
  competition: string;
  stage: string;
  matches: ScoreMatch[];
}

export interface ScoreDay {
  sport: string;
  date: string;
  fetchedAt: number;
  groups: ScoreGroup[];
}

// Livescore publishes the same JSON its own app uses, so the scores on this
// page are the ones livescore.com shows rather than a second-hand summary.
const API = "https://prod-public-api.livescore.com/v1/api/app/date";

export const SPORTS = [
  { slug: "soccer", label: "Football" },
  { slug: "basketball", label: "Basketball" },
  { slug: "tennis", label: "Tennis" },
  { slug: "cricket", label: "Cricket" },
  { slug: "american-football", label: "American football" },
] as const;

export function isSport(v: string): v is (typeof SPORTS)[number]["slug"] {
  return SPORTS.some((s) => s.slug === v);
}

/** The feed is keyed by UTC days; "/0" in the URL asks for times in UTC too. */
export function todayUtc() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function shiftUtcDate(date: string, days: number) {
  const d = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

// A status that is neither a clock nor a period means the match is over.
const FINISHED = /^(FT|ToFi|AET|Walk|Ret\.?|Canc\.?|Postp\.?|Int\.?|WO)$/i;
const NOT_STARTED = /^(NS|TBA)$/i;

function parseKickoff(esd: number): number | null {
  if (!esd || esd < 1e13) return null;
  const s = String(esd);
  const y = +s.slice(0, 4), mo = +s.slice(4, 6), d = +s.slice(6, 8);
  const h = +s.slice(8, 10), mi = +s.slice(10, 12);
  if (!y || mo < 1 || mo > 12) return null;
  return Date.UTC(y, mo - 1, d, h, mi);
}

// The shape livescore.com's own app feed answers with.
type RawTeam = { Nm?: string; Abr?: string; Fc?: string };
type RawEvent = {
  Eid?: string | number;
  Eps?: string;
  Esd?: string | number;
  Tr1?: string | number;
  Tr2?: string | number;
  T1?: RawTeam[];
  T2?: RawTeam[];
};
type RawStage = { CompN?: string; Cnm?: string; Snm?: string; Events?: RawEvent[] };

function team(players: RawTeam[] | undefined): ScoreTeam {
  const list = players ?? [];
  return {
    name: list.map((p) => p?.Nm).filter(Boolean).join(", ") || "—",
    abbr: list.map((p) => p?.Abr).filter(Boolean).join("/") || "",
    color: list[0]?.Fc ? `#${String(list[0].Fc).replace("#", "")}` : null,
  };
}

function normalize(raw: RawEvent): ScoreMatch | null {
  const status = String(raw.Eps ?? "").trim();
  const home = team(raw.T1);
  const away = team(raw.T2);
  if (!status || home.name === "—" || away.name === "—") return null;
  return {
    id: String(raw.Eid),
    home,
    away,
    homeScore: raw.Tr1 != null ? String(raw.Tr1) : null,
    awayScore: raw.Tr2 != null ? String(raw.Tr2) : null,
    status,
    live: !FINISHED.test(status) && !NOT_STARTED.test(status),
    finished: FINISHED.test(status),
    startsAt: parseKickoff(Number(raw.Esd || 0)),
  };
}

type Cache = { day: ScoreDay; at: number };
const cache = new Map<string, Cache>();
// Scores move constantly, so a copy older than this is refetched on the next read.
const TTL_MS = 60 * 1000;

export async function fetchScoreDay(sport: string, date: string): Promise<ScoreDay> {
  const key = `${sport}:${date}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.day;

  const empty: ScoreDay = { sport, date, fetchedAt: Date.now(), groups: [] };
  try {
    const res = await fetch(`${API}/${sport}/${date}/0?MD=1`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" },
    });
    if (!res.ok) return hit?.day ?? empty;
    const json = (await res.json()) as { Stages?: RawStage[] };

    const groups: ScoreGroup[] = [];
    for (const stage of json.Stages ?? []) {
      const matches = (stage.Events ?? [])
        .map(normalize)
        .filter((m): m is ScoreMatch => m !== null);
      if (matches.length === 0) continue;
      groups.push({
        competition: String(stage.CompN || stage.Cnm || "").trim(),
        stage: String(stage.Snm || "").trim(),
        matches,
      });
      if (groups.length >= 60) break;
    }

    const day: ScoreDay = { sport, date, fetchedAt: Date.now(), groups };
    if (groups.length > 0) cache.set(key, { day, at: Date.now() });
    return day;
  } catch {
    return hit?.day ?? empty;
  }
}
