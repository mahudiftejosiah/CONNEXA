"use client";

import { useEffect, useRef, useState } from "react";
import { GameBtn, Stat, readSaved, useBest, useGameSave } from "./shared";

type Grid = number[][];
type Saved = { grid: Grid; score: number };

const SIZE = 4;
const TILE_STYLE: Record<number, { bg: string; fg: string }> = {
  2: { bg: "#efe6d0", fg: "#5b5346" },
  4: { bg: "#e8d9b5", fg: "#5b5346" },
  8: { bg: "#f2a35f", fg: "#ffffff" },
  16: { bg: "#ef8b4b", fg: "#ffffff" },
  32: { bg: "#e8654e", fg: "#ffffff" },
  64: { bg: "#dc4b3f", fg: "#ffffff" },
  128: { bg: "#e9d264", fg: "#ffffff" },
  256: { bg: "#e8cd4a", fg: "#ffffff" },
  512: { bg: "#f0c22e", fg: "#ffffff" },
  1024: { bg: "#f5b912", fg: "#ffffff" },
  2048: { bg: "#12372A", fg: "#D6B875" },
};

function empty(): Grid {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}
function add(s: Grid): Grid {
  const spots: [number, number][] = [];
  s.forEach((row, r) => row.forEach((v, c) => { if (!v) spots.push([r, c]); }));
  if (!spots.length) return s;
  const [r, c] = spots[Math.floor(Math.random() * spots.length)];
  const n = s.map((row) => row.slice());
  n[r][c] = Math.random() < 0.9 ? 2 : 4;
  return n;
}
function slideRow(row: number[]): { out: number[]; gained: number } {
  const vals = row.filter((v) => v);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < vals.length; i++) {
    if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
      out.push(vals[i] * 2);
      gained += vals[i] * 2;
      i++;
    } else out.push(vals[i]);
  }
  while (out.length < SIZE) out.push(0);
  return { out, gained };
}
function transpose(s: Grid): Grid {
  return s[0].map((_, c) => s.map((row) => row[c]));
}
function move(s: Grid, dir: "left" | "right" | "up" | "down"): { grid: Grid; gained: number; moved: boolean } {
  let g = s.map((r) => r.slice());
  let gained = 0;
  if (dir === "up" || dir === "down") g = transpose(g);
  if (dir === "right" || dir === "down") g = g.map((r) => r.slice().reverse());
  g = g.map((r) => {
    const res = slideRow(r);
    gained += res.gained;
    return res.out;
  });
  if (dir === "right" || dir === "down") g = g.map((r) => r.slice().reverse());
  if (dir === "up" || dir === "down") g = transpose(g);
  const moved = JSON.stringify(g) !== JSON.stringify(s);
  return { grid: g, gained, moved };
}

export default function Game2048() {
  const resumeRef = useRef<Saved | null>(readSaved<Saved>("2048"));
  const [grid, setGrid] = useState<Grid>(() => resumeRef.current?.grid ?? add(add(empty())));
  const [score, setScore] = useState(() => resumeRef.current?.score ?? 0);
  const best = useBest("2048", score);
  const [lost, setLost] = useState(false);
  const touch = useRef({ x: 0, y: 0 });
  // Once this device has played (or restored) we stop applying the server copy,
  // so a slower fetch can never overwrite a live board.
  const settled = useRef(Boolean(resumeRef.current));
  const save = useGameSave<Saved>("2048", (snap) => {
    if (settled.current) return;
    settled.current = true;
    setGrid(snap.grid);
    setScore(snap.score);
  });

  const doMove = (dir: "left" | "right" | "up" | "down") => {
    if (lost) return;
    const res = move(grid, dir);
    if (!res.moved) return;
    const next = add(res.grid);
    const nextScore = score + res.gained;
    const dead = (["left", "right", "up", "down"] as const).every((d) => !move(next, d).moved);
    setGrid(next);
    setScore(nextScore);
    setLost(dead);
    save(dead ? null : { grid: next, score: nextScore });
  };

  const moveRef = useRef(doMove);
  moveRef.current = doMove;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, "left" | "right" | "up" | "down"> = {
        ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
        a: "left", d: "right", w: "up", s: "down",
      };
      const dir = map[e.key];
      if (dir) { e.preventDefault(); moveRef.current(dir); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function restart() {
    settled.current = true;
    save(null);
    setGrid(add(add(empty())));
    setScore(0);
    setLost(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <Stat label="Score" value={score} />
          <Stat label="Best" value={best} />
        </div>
        <GameBtn onClick={restart}>New game</GameBtn>
      </div>
      <div
        className="relative w-fit mx-auto rounded-xl p-2 grid grid-cols-4 gap-2 select-none"
        style={{ backgroundColor: "#bbada0", touchAction: "none" }}
        onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - touch.current.x;
          const dy = e.changedTouches[0].clientY - touch.current.y;
          if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
          doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
        }}
      >
        {grid.map((row, r) =>
          row.map((v, c) => (
            <div
              key={`${r}-${c}`}
              className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-lg flex items-center justify-center font-extrabold"
              style={{
                backgroundColor: v ? (TILE_STYLE[v]?.bg ?? "#12372A") : "rgba(238,228,218,0.35)",
                color: v ? (TILE_STYLE[v]?.fg ?? "#fff") : "transparent",
                fontSize: v >= 1024 ? 18 : v >= 128 ? 22 : 26,
              }}
            >
              {v || ""}
            </div>
          ))
        )}
        {lost && (
          <div className="absolute inset-0 rounded-xl bg-black/55 flex flex-col items-center justify-center gap-2">
            <p className="text-white font-bold text-lg">Game over</p>
            <GameBtn onClick={restart} className="!bg-white !text-black">Try again</GameBtn>
          </div>
        )}
      </div>
      <p className="text-xs text-center" style={{ color: "var(--text-secondary)" }}>
        Arrow keys / WASD on desktop, swipe on mobile.
      </p>
    </div>
  );
}
