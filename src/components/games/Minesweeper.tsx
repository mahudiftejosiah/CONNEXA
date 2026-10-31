"use client";

import { useRef, useState } from "react";
import { GameBtn, Stat, readSaved, useBest, useGameSave } from "./shared";

const SIZE = 9;
const MINES = 10;

type Sq = { mine: boolean; open: boolean; flag: boolean; adj: number };
type Saved = { board: Sq[][] };

function makeBoard(safeR: number, safeC: number): Sq[][] {
  const b: Sq[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({ mine: false, open: false, flag: false, adj: 0 }))
  );
  let placed = 0;
  while (placed < MINES) {
    const r = Math.floor(Math.random() * SIZE);
    const c = Math.floor(Math.random() * SIZE);
    if (b[r][c].mine || (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1)) continue;
    b[r][c].mine = true;
    placed++;
  }
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && b[nr][nc].mine) n++;
        }
      }
      b[r][c].adj = n;
    }
  }
  return b;
}

function floodOpen(b: Sq[][], r: number, c: number) {
  const stack: [number, number][] = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop()!;
    const sq = b[cr][cc];
    if (sq.open || sq.flag) continue;
    sq.open = true;
    if (sq.adj === 0 && !sq.mine) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = cr + dr, nc = cc + dc;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && !b[nr][nc].open) stack.push([nr, nc]);
        }
      }
    }
  }
}

const NUM_COLORS = ["", "#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#b45309", "#0891b2", "#111827", "#6b7280"];

export default function Minesweeper() {
  const resumeRef = useRef<Saved | null>(readSaved<Saved>("mines"));
  const [board, setBoard] = useState<Sq[][] | null>(resumeRef.current?.board ?? null);
  const [lost, setLost] = useState(false);
  const [won, setWon] = useState(false);
  const [flagMode, setFlagMode] = useState(false);
  // A server copy is only applied while this device has not played yet.
  const settled = useRef(Boolean(resumeRef.current));
  const save = useGameSave<Saved>("mines", (snap) => {
    if (settled.current) return;
    settled.current = true;
    setBoard(snap.board);
  });

  const cleared = board ? board.flat().filter((s) => s.open && !s.mine).length : 0;
  const best = useBest("mines", won ? cleared : 0);

  function act(r: number, c: number, flag: boolean) {
    if (lost || won) return;
    settled.current = true;
    const b = board ? board.map((row) => row.map((s) => ({ ...s }))) : makeBoard(r, c);
    const sq = b[r][c];
    if (flag) {
      if (!sq.open) sq.flag = !sq.flag;
      setBoard(b);
      save({ board: b });
      return;
    }
    if (sq.flag || sq.open) return;
    if (sq.mine) {
      b.forEach((row) => row.forEach((s) => { if (s.mine) s.open = true; }));
      setBoard(b);
      setLost(true);
      save(null);
      return;
    }
    floodOpen(b, r, c);
    setBoard(b);
    const safeOpen = b.flat().filter((s) => !s.mine && s.open).length;
    if (safeOpen === SIZE * SIZE - MINES) {
      setWon(true);
      save(null);
    } else {
      save({ board: b });
    }
  }

  function reset() {
    settled.current = true;
    save(null);
    setBoard(null);
    setLost(false);
    setWon(false);
  }

  const shown: Sq[][] = board ?? Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({ mine: false, open: false, flag: false, adj: -1 }))
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 justify-between flex-wrap">
        <div className="flex items-center gap-4">
          <Stat label="Mines" value={MINES} />
          <Stat label="Cleared" value={cleared} />
          <Stat label="Best" value={best} />
        </div>
        <div className="flex gap-2">
          <GameBtn
            onClick={() => setFlagMode((f) => !f)}
            className={flagMode ? "!bg-[#12372A] !text-white" : ""}
          >
            {flagMode ? "Flag: ON" : "Flag: OFF"}
          </GameBtn>
          <GameBtn onClick={reset}>New field</GameBtn>
        </div>
      </div>
      {won && <p className="text-sm font-bold" style={{ color: "#16a34a" }}>Field cleared — you win!</p>}
      {lost && <p className="text-sm font-bold" style={{ color: "#dc2626" }}>Boom! Hit a mine.</p>}
      <div className="grid gap-1 w-fit mx-auto select-none" style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}>
        {shown.map((row, r) =>
          row.map((sq, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              onClick={() => act(r, c, flagMode)}
              onContextMenu={(e) => { e.preventDefault(); act(r, c, true); }}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded text-xs sm:text-sm font-bold flex items-center justify-center"
              style={{
                backgroundColor: sq.open ? (sq.mine ? "#fecaca" : "var(--bg-card)") : "#c3ced8",
                border: "1px solid var(--border)",
                color: NUM_COLORS[sq.adj] || "var(--text-primary)",
              }}
              aria-label={`Cell ${r + 1},${c + 1}`}
            >
              {sq.open ? (sq.mine ? "X" : sq.adj > 0 ? sq.adj : "") : sq.flag ? "F" : ""}
            </button>
          ))
        )}
      </div>
      <p className="text-xs text-center" style={{ color: "var(--text-secondary)" }}>
        Tap to reveal. Right-click (or Flag mode) marks a suspect cell. First tap is always safe.
      </p>
    </div>
  );
}
