"use client";

import { useState } from "react";
import { ArrowLeft, Gamepad2, Bug, Car, Dices, Grid3x3, Zap, Brain, Target, Bomb, Feather, Circle, SquareStack } from "lucide-react";
import Snake from "@/components/games/Snake";
import Racing from "@/components/games/Racing";
import Pong from "@/components/games/Pong";
import Breakout from "@/components/games/Breakout";
import Game2048 from "@/components/games/Game2048";
import TicTacToe from "@/components/games/TicTacToe";
import MemoryMatch from "@/components/games/MemoryMatch";
import WhackAMole from "@/components/games/WhackAMole";
import SimonSays from "@/components/games/SimonSays";
import Minesweeper from "@/components/games/Minesweeper";
import Flappy from "@/components/games/Flappy";
import { ExternalLink } from "lucide-react";
import type { ExternalGame } from "@/lib/supabase/types";

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

export default function GamesClient({ externalGames = [] }: { externalGames?: ExternalGame[] }) {
  const [active, setActive] = useState<string | null>(null);
  const game = GAMES.find((g) => g.id === active);

  if (game) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setActive(null)}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="w-4 h-4" /> All games
        </button>
        <div
          className="rounded-2xl border p-4 sm:p-6"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <h2 className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            {game.name}
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>{game.desc}</p>
          {game.play}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Gamepad2 className="w-6 h-6" style={{ color: "rgb(var(--a-800))" }} />
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Games &amp; Fun</h1>
      </div>
      <p className="text-sm -mt-2" style={{ color: "var(--text-secondary)" }}>
        Quick 2D arcade games, playable on any device. Your best scores are saved on this device.
      </p>
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
            <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{g.name}</p>
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
    </div>
  );
}
