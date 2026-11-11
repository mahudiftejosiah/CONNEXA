"use client";

import { useState } from "react";
import { ArrowLeft, Gamepad2, Bug, Car, Dices, Grid3x3, Zap, Brain, Target, Bomb, Feather, Circle, SquareStack, Maximize2, Minimize2 } from "lucide-react";
import dynamic from "next/dynamic";
// Eleven games is a lot of canvas code to pull in just to show a menu, so each
// one becomes its own chunk and only downloads when it is actually opened.
function GameLoading() {
  return <div className="py-10 text-center text-sm" style={{ color: "var(--text-secondary)" }}>Loading game…</div>;
}
const load = (p: () => Promise<{ default: React.ComponentType }>) => dynamic(p, { ssr: false, loading: GameLoading });
const Snake = load(() => import("@/components/games/Snake"));
const Racing = load(() => import("@/components/games/Racing"));
const Pong = load(() => import("@/components/games/Pong"));
const Breakout = load(() => import("@/components/games/Breakout"));
const Game2048 = load(() => import("@/components/games/Game2048"));
const TicTacToe = load(() => import("@/components/games/TicTacToe"));
const MemoryMatch = load(() => import("@/components/games/MemoryMatch"));
const WhackAMole = load(() => import("@/components/games/WhackAMole"));
const SimonSays = load(() => import("@/components/games/SimonSays"));
const Minesweeper = load(() => import("@/components/games/Minesweeper"));
const Flappy = load(() => import("@/components/games/Flappy"));
import { ExternalLink, Box, Play, Trophy, CircleDollarSign, Swords } from "lucide-react";
import {
  Truck, Crosshair, Volleyball, Snowflake, Skull, Ghost, Rocket, Flame,
  PersonStanding, Bike, Blocks, Waves, Anchor,
} from "lucide-react";
import type { ExternalGame, SiteShortcut } from "@/lib/supabase/types";
import { TRENDING_3D, trendingCover, type TrendingGame, type TrendingArt } from "@/lib/trending-games";
import { GameUserContext } from "@/components/games/GameUserContext";
import { SiteIconGrid } from "@/components/ui/SiteIconGrid";
import { ScoreBoard } from "@/components/games/ScoreBoard";
import { LiveGamePicker } from "@/components/games/live/LiveGamePicker";
import { useFullscreen } from "@/lib/useFullscreen";

const GAMES: { id: string; name: string; desc: string; icon: React.ReactNode; color: string; play: React.ReactNode }[] = [
  { id: "snake",      name: "Snake",         desc: "Eat, grow, don't bite yourself.",   icon: <Bug className="w-7 h-7" />,            color: "#22c55e", play: <Snake /> },
  { id: "racing",     name: "Street Racer",  desc: "Dodge traffic as fast as you can.", icon: <Car className="w-7 h-7" />,            color: "#ef4444", play: <Racing /> },
  { id: "flappy",     name: "Flappy Wings",  desc: "One tap. Endless pipes. Sorry.",    icon: <Feather className="w-7 h-7" />,        color: "#f59e0b", play: <Flappy /> },
  { id: "breakout",   name: "Breakout",      desc: "Smash every brick with the ball.",  icon: <SquareStack className="w-7 h-7" />,    color: "#6366f1", play: <Breakout /> },
  { id: "pong",       name: "Pong Duel",     desc: "Classic rally against the CPU.",    icon: <Circle className="w-7 h-7" />,         color: "#14b8a6", play: <Pong /> },
  { id: "2048",       name: "2048",          desc: "Merge tiles, reach 2048.",          icon: <Grid3x3 className="w-7 h-7" />,        color: "#d97706", play: <Game2048 /> },
  { id: "ttt",        name: "Tic-Tac-Toe",   desc: "Three in a row vs the machine.",    icon: <Dices className="w-7 h-7" />,          color: "#8b5cf6", play: <TicTacToe /> },
  { id: "memory",     name: "Memory Match",  desc: "Find all the matching pairs.",      icon: <Brain className="w-7 h-7" />,          color: "#ec4899", play: <MemoryMatch /> },
  { id: "whack",      name: "Whack-a-Mole",  desc: "30 seconds. Reflexes only.",        icon: <Target className="w-7 h-7" />,         color: "#f97316", play: <WhackAMole /> },
  { id: "simon",      name: "Simon Pulse",   desc: "Repeat the glowing sequence.",      icon: <Zap className="w-7 h-7" />,            color: "#06b6d4", play: <SimonSays /> },
  { id: "mines",      name: "Minesweeper",   desc: "Clear the field, avoid bombs.",     icon: <Bomb className="w-7 h-7" />,           color: "#64748b", play: <Minesweeper /> },
];

const TREND_ART: Record<TrendingArt, React.ReactNode> = {
  car: <Car className="w-8 h-8" />,
  truck: <Truck className="w-8 h-8" />,
  crosshair: <Crosshair className="w-8 h-8" />,
  ball: <Volleyball className="w-8 h-8" />,
  snowflake: <Snowflake className="w-8 h-8" />,
  bomb: <Bomb className="w-8 h-8" />,
  flame: <Flame className="w-8 h-8" />,
  target: <Target className="w-8 h-8" />,
  skull: <Skull className="w-8 h-8" />,
  ghost: <Ghost className="w-8 h-8" />,
  rocket: <Rocket className="w-8 h-8" />,
  swords: <Swords className="w-8 h-8" />,
  runner: <PersonStanding className="w-8 h-8" />,
  bike: <Bike className="w-8 h-8" />,
  blocks: <Blocks className="w-8 h-8" />,
  grid: <Grid3x3 className="w-8 h-8" />,
  dice: <Dices className="w-8 h-8" />,
  anchor: <Anchor className="w-8 h-8" />,
  waves: <Waves className="w-8 h-8" />,
};

export default function GamesClient({
  externalGames = [],
  currentUserId = null,
  sportsSites = [],
  bettingSites = [],
  friends = [],
  myScores = [],
}: {
  externalGames?: ExternalGame[];
  currentUserId?: string | null;
  sportsSites?: SiteShortcut[];
  bettingSites?: SiteShortcut[];
  friends?: { id: string; username: string; display_name: string; avatar_url: string | null; last_seen?: string | null }[];
  myScores?: { game_id: string; best: number; points: number }[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const [trend, setTrend] = useState<TrendingGame | null>(null);
  const [scoreSite, setScoreSite] = useState<SiteShortcut | null>(null);
  const frame = useFullscreen<HTMLDivElement>();
  const trendScreen = useFullscreen<HTMLDivElement>();
  const game = GAMES.find((g) => g.id === active);

  const bestBy = new Map(myScores.map((s) => [s.game_id, s.best]));
  const careerPoints = myScores.reduce((n, s) => n + (s.points || s.best || 0), 0);

  // Asked for inside the click itself, on the container that is already on the
  // page; a browser that refuses the request gets the same screen from CSS.
  function openTrend(g: TrendingGame) {
    setActive(null);
    setScoreSite(null);
    setTrend(g);
    trendScreen.enter();
  }
  function closeTrend() {
    trendScreen.exit();
    setTrend(null);
  }

  // The score sites refuse to be framed and only fill in once their own
  // scripts run, so their icon opens our fixture board rather than leaving
  // the app.
  function openScores(s: SiteShortcut) {
    setActive(null);
    setTrend(null);
    setScoreSite(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (game) {
    return (
      <div ref={frame.ref} className={`game-frame space-y-4${frame.active ? " pseudo-full" : ""}`}>
        <div className="flex items-center justify-between">
          <button
            onClick={() => { frame.exit(); setActive(null); }}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="w-4 h-4" /> All games
          </button>
          <button
            onClick={frame.toggle}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl border"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            {frame.active ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            {frame.active ? "Exit full screen" : "Full screen"}
          </button>
        </div>
        <div
          className="rounded-2xl border p-4 sm:p-6"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <h2 className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            {game.name}
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>{game.desc}</p>
          <GameUserContext.Provider value={currentUserId}>{game.play}</GameUserContext.Provider>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div ref={trendScreen.ref} className={trend ? `trend-shell${trendScreen.active ? " pseudo-full" : ""}` : ""}>
        {trend && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between gap-2 p-2 sm:p-3" style={{ backgroundColor: "#0b1512" }}>
              <div className="min-w-0">
                <p className="font-bold text-white truncate">{trend.name}</p>
                <p className="text-xs text-white/60 truncate">{trend.desc}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={trendScreen.toggle}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl border border-white/15 text-white hover:bg-white/10"
                >
                  {trendScreen.active ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  {trendScreen.active ? "Exit full screen" : "Full screen"}
                </button>
                <button
                  onClick={closeTrend}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl border border-white/15 text-white hover:bg-white/10"
                >
                  <ArrowLeft className="w-4 h-4" /> Close
                </button>
              </div>
            </div>
            <iframe
              src={trend.url}
              title={trend.name}
              className="w-full flex-1 min-h-[60vh] border-0 bg-black"
              allow="autoplay; fullscreen; gamepad; keyboard-map; xr-spatial-tracking; clipboard-write"
              allowFullScreen
            />
          </div>
        )}
      </div>

      {scoreSite && (
        <ScoreBoard
          site={scoreSite}
          onClose={() => {
            setScoreSite(null);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {!trend && !scoreSite && (
        <>
      <div className="flex items-center gap-2">
        <Gamepad2 className="w-6 h-6" style={{ color: "rgb(var(--a-800))" }} />
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Games &amp; Fun</h1>
      </div>
      <p className="text-sm -mt-2" style={{ color: "var(--text-secondary)" }}>
        Play instantly — nothing to download. Challenge a friend to a real board game, open a 3D hit in full screen, or grab a quick arcade round.
      </p>
      <div className="flex items-center gap-2 pt-2">
        <Swords className="w-5 h-5" style={{ color: "rgb(var(--a-800))" }} />
        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Live games</h2>
        <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
          style={{ backgroundColor: "rgb(var(--a-800) / 0.1)", color: "rgb(var(--a-800))" }}>
          Versus friends
        </span>
      </div>
      {currentUserId ? (
        <LiveGamePicker currentUserId={currentUserId} friends={friends} />
      ) : (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Sign in to challenge a friend to Whot, Chess or Ludo.</p>
      )}

      <div className="flex items-center gap-2 pt-2 flex-wrap">
        <Gamepad2 className="w-5 h-5" style={{ color: "rgb(var(--a-800))" }} />
        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>2D arcade</h2>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {currentUserId ? "Scores save to your account — 2048 and Minesweeper resume where you stopped" : "Best scores save on this device"}
        </span>
        {currentUserId && careerPoints > 0 && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "rgb(var(--a-800) / 0.1)", color: "rgb(var(--a-800))" }}
          >
            {careerPoints.toLocaleString()} points
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {GAMES.map((g) => (
          <button
            key={g.id}
            onClick={() => setActive(g.id)}
            className="rounded-2xl border p-4 text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 text-white"
              style={{ backgroundColor: g.color }}
            >
              {g.icon}
            </div>
            <p className="font-bold text-sm flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-primary)" }}>
              {g.name}
              {bestBy.get(g.id) ? (
                <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgb(var(--b-500) / 0.15)", color: "rgb(var(--b-500))" }}>
                  {bestBy.get(g.id)} pts
                </span>
              ) : null}
            </p>
            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{g.desc}</p>
          </button>
        ))}
      </div>

      {externalGames.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-2">
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Featured outside</h2>
            <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "rgb(var(--a-800) / 0.1)", color: "rgb(var(--a-800))" }}>
              Curated
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {externalGames.map((g) => (
              <a key={g.id} href={g.play_url} target="_blank" rel="noopener noreferrer"
                className="rounded-2xl border overflow-hidden transition-transform hover:scale-[1.02]"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                {g.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.cover_url} alt={g.title} className="w-full h-28 object-cover" />
                ) : (
                  <div className="w-full h-28 flex items-center justify-center" style={{ backgroundColor: "var(--border)" }}>
                    <Gamepad2 className="w-8 h-8" style={{ color: "var(--text-secondary)" }} />
                  </div>
                )}
                <div className="p-3">
                  <p className="font-bold text-sm flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                    <span className="flex-1 truncate">{g.title}</span>
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-secondary)" }} />
                  </p>
                  {g.description && (
                    <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{g.description}</p>
                  )}
                </div>
              </a>
            ))}
          </div>
        </>
      )}

      {TRENDING_3D.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-2">
            <Box className="w-5 h-5" style={{ color: "rgb(var(--a-800))" }} />
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Trending games</h2>
            <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "rgb(var(--a-800) / 0.1)", color: "rgb(var(--a-800))" }}>
              Real 3D · Full screen
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {TRENDING_3D.map((g) => (
              <button
                key={g.id}
                onClick={() => openTrend(g)}
                className="relative rounded-2xl border overflow-hidden text-left transition-transform hover:scale-[1.02] active:scale-[0.98] group"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="w-full h-28 flex items-center justify-center relative"
                  style={{ background: `linear-gradient(135deg,${trendingCover(g.id).from},${trendingCover(g.id).to})` }}>
                  <span className="w-14 h-14 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-white shadow-sm">
                    {TREND_ART[g.art]}
                  </span>
                  <Box className="w-7 h-7 text-white/45 absolute bottom-2 right-2" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/45 transition-colors">
                  <span className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-5 h-5 text-black ml-0.5" fill="currentColor" />
                  </span>
                </div>
                <div className="p-3">
                  <p className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>{g.name}</p>
                  <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{g.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {sportsSites.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-2">
            <Trophy className="w-5 h-5" style={{ color: "rgb(var(--a-800))" }} />
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Sports &amp; browse</h2>
            <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "rgb(var(--a-800) / 0.1)", color: "rgb(var(--a-800))" }}>
              Live scores
            </span>
          </div>
          <SiteIconGrid items={sportsSites} onOpen={openScores} />
        </>
      )}

      {bettingSites.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-2">
            <CircleDollarSign className="w-5 h-5" style={{ color: "rgb(var(--a-800))" }} />
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Betting</h2>
            <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "rgb(var(--a-800) / 0.1)", color: "rgb(var(--a-800))" }}>
              18+ only
            </span>
          </div>
          <SiteIconGrid items={bettingSites} />
        </>
      )}
        </>
      )}
    </div>
  );
}
