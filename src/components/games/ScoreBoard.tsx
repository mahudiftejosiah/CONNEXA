"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { SPORTS, type ScoreDay, type ScoreMatch, type ScoreTeam } from "@/lib/scores";
import { useFullscreen } from "@/lib/useFullscreen";
import type { SiteShortcut } from "@/lib/supabase/types";

const DATES = [
  { offset: -1, label: "Yesterday" },
  { offset: 0, label: "Today" },
  { offset: 1, label: "Tomorrow" },
];

const REFRESH_MS = 60 * 1000;

function TeamDot({ color }: { color: string | null }) {
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: color || "var(--border)" }}
    />
  );
}

function TeamLine({ team, score }: { team: ScoreTeam; score: string | null }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <TeamDot color={team.color} />
      <span className="flex-1 min-w-0 truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {team.name}
      </span>
      <span className="tabular-nums text-sm font-bold w-6 text-right" style={{ color: "var(--text-primary)" }}>
        {score ?? "–"}
      </span>
    </div>
  );
}

function MatchRow({ m }: { m: ScoreMatch }) {
  const kickoff = m.startsAt
    ? new Date(m.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "–:–";
  return (
    <div className="grid grid-cols-[56px_1fr] gap-3 items-center px-4 py-2">
      <span
        className={`text-[11px] font-bold px-1.5 py-1 rounded-lg text-center ${m.live ? "text-white" : ""}`}
        style={{
          backgroundColor: m.live ? "#22c55e" : "var(--border)",
          color: m.live ? "#fff" : "var(--text-secondary)",
        }}
      >
        {m.live ? m.status : m.finished ? "FT" : kickoff}
      </span>
      <div className="space-y-1 min-w-0">
        <TeamLine team={m.home} score={m.homeScore} />
        <TeamLine team={m.away} score={m.awayScore} />
      </div>
    </div>
  );
}

function Group({ competition, stage, matches }: ScoreDay["groups"][number]) {
  const [open, setOpen] = useState(false);
  const shown = open ? matches : matches.slice(0, 8);
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}>
        <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{competition || "Fixtures"}</p>
        {stage && (
          <p className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{stage}</p>
        )}
      </div>
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {shown.map((m) => <MatchRow key={m.id} m={m} />)}
      </div>
      {matches.length > 8 && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full py-2 text-xs font-semibold hover:opacity-70"
          style={{ color: "rgb(var(--a-800))", borderColor: "var(--border)" }}
        >
          {open ? "Show fewer" : `Show all ${matches.length}`}
        </button>
      )}
    </div>
  );
}

/**
 * The score sites' fixtures, drawn inside CONNEXA. Their own pages refuse to be
 * framed and only fill in once their scripts run, so the API route reads the
 * same feed livescore.com uses and this renders it.
 */
export function ScoreBoard({ site, onClose }: { site: SiteShortcut; onClose: () => void }) {
  const [sport, setSport] = useState<string>("soccer");
  const [offset, setOffset] = useState(0);
  const [day, setDay] = useState<ScoreDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const screen = useFullscreen<HTMLDivElement>();
  const ticket = useRef(0);

  const load = useCallback(async () => {
    const my = ++ticket.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/scores?sport=${sport}&offset=${offset}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (my !== ticket.current) return;
      if (!res.ok || !json?.groups) {
        setError(json?.error || "The scores could not be read just now.");
        setDay(null);
      } else {
        setError(null);
        setDay(json as ScoreDay);
      }
    } catch {
      if (my === ticket.current) setError("The scores could not be read just now.");
    } finally {
      if (my === ticket.current) setLoading(false);
    }
  }, [sport, offset]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const host = site.url.replace(/^https?:\/\//, "").split("/")[0];

  return (
    <div
      ref={screen.ref}
      className={`score-shell flex flex-col${screen.active ? " pseudo-full" : ""}`}
    >
      <div className="flex items-center gap-2 p-3 border-b flex-wrap" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
        <button onClick={onClose} className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>{site.name} · Live scores</p>
          <p className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
            {loading ? "Updating…" : `Updated ${new Date(day?.fetchedAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => void load()} aria-label="Refresh scores" className="p-2 rounded-xl border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={screen.toggle} aria-label="Full screen" className="p-2 rounded-xl border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            {screen.active ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <a href={site.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${host} in a new tab`} className="p-2 rounded-xl border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      <div className="flex gap-2 p-3 overflow-x-auto rail" style={{ backgroundColor: "var(--bg-card)" }}>
        {SPORTS.map((s) => (
          <button key={s.slug} onClick={() => setSport(s.slug)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors"
            style={sport === s.slug
              ? { backgroundColor: "rgb(var(--a-800))", color: "#fff" }
              : { backgroundColor: "var(--border)", color: "var(--text-secondary)" }}>
            {s.label}
          </button>
        ))}
        <span className="w-px flex-shrink-0" style={{ backgroundColor: "var(--border)" }} />
        {DATES.map((d) => (
          <button key={d.offset} onClick={() => setOffset(d.offset)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors"
            style={offset === d.offset
              ? { backgroundColor: "rgb(var(--a-800))", color: "#fff" }
              : { backgroundColor: "var(--border)", color: "var(--text-secondary)" }}>
            {d.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {error && (
          <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--bg-card)" }}>
            {error}
            <a className="block mt-1 font-semibold" style={{ color: "rgb(var(--a-800))" }} href={site.url} target="_blank" rel="noopener noreferrer">
              Open {host} instead
            </a>
          </div>
        )}
        {!error && loading && !day && (
          <p className="text-sm py-10 text-center" style={{ color: "var(--text-secondary)" }}>Loading the fixture list…</p>
        )}
        {!error && day?.groups.length === 0 && (
          <p className="text-sm py-10 text-center" style={{ color: "var(--text-secondary)" }}>No matches scheduled for this day.</p>
        )}
        {day?.groups.map((g, i) => <Group key={`${g.competition}-${g.stage}-${i}`} {...g} />)}
      </div>
    </div>
  );
}
