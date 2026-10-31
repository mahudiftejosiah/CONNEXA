"use client";

import { Flag, Star } from "lucide-react";
import {
  ludoSummary,
  lastMoveText,
  movablePieces,
  movePiece,
  pieceColor,
  rollDice,
  safeCells,
  type LudoState,
} from "@/lib/games/ludo";

// The 52 ring cells laid clockwise on a 15x15 grid; index 0 is Red's start
// (left arm, top lane) and index 26 is Green's start, directly opposite.
const RING: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
];
const RING_AT = new Map(RING.map(([r, c], i) => [`${r},${c}`, i] as const));
const SAFE = safeCells();

const BASE_ORIGIN: [number, number][] = [[0, 0], [9, 9]];
const BASE_SLOT: [number, number][] = [[1, 1], [1, 4], [4, 1], [4, 4]];
const CENTER_SLOT: [number, number][] = [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]];

const TOKEN_BG: Record<"red" | "green", string> = { red: "bg-red-500", green: "bg-green-600" };

function tokenPos(p: 0 | 1, cell: number, idx: number): [number, number] {
  if (cell === -1) {
    const [or, oc] = BASE_ORIGIN[p];
    const [sr, sc] = BASE_SLOT[idx];
    return [or + sr, oc + sc];
  }
  if (cell === 200) {
    const [dr, dc] = CENTER_SLOT[idx];
    return [7 + dr, 7 + dc];
  }
  if (cell >= 100 && cell <= 105) return p === 0 ? [7, 1 + (cell - 100)] : [7, 13 - (cell - 100)];
  return RING[cell];
}

const inBase = (r: number, c: number) => (r < 6 || r > 8) && (c < 6 || c > 8);

function counts(s: LudoState, p: 0 | 1) {
  const a = s.pieces[p];
  return {
    base: a.filter((c) => c === -1).length,
    track: a.filter((c) => c >= 0 && c <= 51).length,
    home: a.filter((c) => c >= 100 && c <= 105).length,
    finished: a.filter((c) => c === 200).length,
  };
}

export default function LudoBoard({
  state,
  me,
  onPlay,
  disabled,
}: {
  state: LudoState;
  me: 0 | 1;
  onPlay: (next: LudoState) => void;
  disabled?: boolean;
}) {
  const over = state.result !== "ongoing";
  const isMine = !disabled && !over && state.turn === me;
  const movable = isMine && state.rolled ? movablePieces(state) : [];

  const cells: JSX.Element[] = [];
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      if (inBase(r, c)) continue;
      const key = `${r}-${c}`;
      const ringIdx = RING_AT.get(`${r},${c}`);
      const base = {
        style: { gridRowStart: r + 1, gridColumnStart: c + 1, borderColor: "var(--border)" },
        className: "border",
      };
      if (ringIdx !== undefined) {
        const start = ringIdx === 0 ? "bg-red-400" : ringIdx === 26 ? "bg-green-400" : "";
        const safeCell = SAFE.includes(ringIdx);
        cells.push(
          <div
            key={key}
            style={base.style}
            className={`${base.className} relative flex items-center justify-center rounded-[2px] ${start || ""}`}
          >
            {safeCell && !start ? (
              <Star className="h-full w-full p-[22%] opacity-40" style={{ color: "var(--text-secondary)" }} />
            ) : null}
          </div>
        );
      } else if (r === 7 && c >= 1 && c <= 6) {
        cells.push(
          <div key={key} style={base.style} className={`${base.className} rounded-[2px] bg-red-400`} />
        );
      } else if (r === 7 && c >= 8 && c <= 13) {
        cells.push(
          <div key={key} style={base.style} className={`${base.className} rounded-[2px] bg-green-400`} />
        );
      } else if ((r === 6 || r === 8) && c === 7) {
        cells.push(<div key={key} style={base.style} className={`${base.className} rounded-[2px]`} />);
      } else if (r === 7 && c === 7) {
        cells.push(
          <div
            key={key}
            style={{ ...base.style, backgroundColor: "rgb(var(--a-800))" }}
            className="flex items-center justify-center rounded-[3px]"
          >
            <Flag className="h-full w-full p-[24%] text-white opacity-80" />
          </div>
        );
      } else {
        cells.push(
          <div key={key} style={base.style} className={`${base.className} rounded-[2px] bg-[var(--bg-card)]`} />
        );
      }
    }
  }

  const bases: [number, number, string, string][] = [
    [0, 0, "bg-red-400/25", "Red"],
    [0, 9, "bg-[var(--bg-card)]", ""],
    [9, 0, "bg-[var(--bg-card)]", ""],
    [9, 9, "bg-green-400/25", "Green"],
  ];

  const tokens: JSX.Element[] = [];
  ([0, 1] as const).forEach((p) => {
    state.pieces[p].forEach((cell, idx) => {
      const [r, c] = tokenPos(p, cell, idx);
      const mine = p === state.turn;
      const tappable = isMine && movable.includes(idx);
      tokens.push(
        <button
          key={`t-${p}-${idx}`}
          type="button"
          aria-label={`${pieceColor(p)} token ${idx + 1}`}
          disabled={!tappable}
          onClick={() => tappable && onPlay(movePiece(state, idx))}
          className={`absolute z-10 flex aspect-square w-[6.4%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-black/25 text-[8px] font-bold text-white ${TOKEN_BG[pieceColor(p)]} ${
            tappable ? "cursor-pointer ring-2 ring-white" : mine && isMine ? "opacity-40" : ""
          }`}
          style={{ left: `${((c + 0.5) / 15) * 100}%`, top: `${((r + 0.5) / 15) * 100}%` }}
        >
          {idx + 1}
        </button>
      );
    });
  });

  return (
    <div className="space-y-2">
      <div
        className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: state.turn === 0 ? "rgb(239 68 68)" : "rgb(22 163 74)" }}
          />
          <span className="truncate">{ludoSummary(state)}</span>
        </span>
        <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
          {lastMoveText(state)}
        </span>
      </div>

      <div className="relative">
        <div
          className="grid aspect-square w-full grid-cols-[repeat(15,minmax(0,1fr))] gap-[1px] rounded-xl border p-1"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          {bases.map(([r, c, cls, label], i) => (
            <div
              key={`b-${i}`}
              style={{ gridRowStart: r + 1, gridColumnStart: c + 1, gridRowEnd: `span 6`, gridColumnEnd: `span 6`, borderColor: "var(--border)" }}
              className={`relative flex items-center justify-center rounded-lg border ${cls}`}
            >
              {label ? (
                <span className="absolute left-1 top-1 text-[10px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                  {label}
                </span>
              ) : null}
              <div className="h-[55%] w-[55%] rounded-full border-2" style={{ borderColor: "var(--border)" }} />
            </div>
          ))}
          {cells}
        </div>
        {tokens}
        {isMine && !state.rolled ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center pb-6">
            <button
              type="button"
              onClick={() => onPlay(rollDice(state))}
              className="pointer-events-auto rounded-full px-6 py-2 text-sm font-semibold text-white shadow-lg"
              style={{ backgroundColor: "rgb(var(--a-800))" }}
            >
              Roll
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "var(--text-secondary)" }}>
        <span
          className="flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold tabular-nums"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)", color: "var(--text-primary)" }}
        >
          {state.dice ?? "–"}
        </span>
        {([0, 1] as const).map((p) => {
          const k = counts(state, p);
          return (
            <span
              key={p}
              className="flex items-center gap-1 rounded-md border px-2 py-1"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
            >
              <span
                className={`h-2 w-2 rounded-full ${TOKEN_BG[pieceColor(p)]}`}
              />
              <span style={{ color: "var(--text-primary)" }} className="font-semibold capitalize">
                {pieceColor(p)}
              </span>
              base {k.base} · track {k.track} · home {k.home} · done {k.finished}
            </span>
          );
        })}
      </div>

      <div
        className="max-h-24 overflow-y-auto rounded-lg border px-2 py-1 text-[10px] leading-relaxed"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)", color: "var(--text-secondary)" }}
      >
        {state.log.slice(-6).map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        {state.log.length === 0 ? <div>Roll to begin.</div> : null}
      </div>

      {over && state.winner !== null ? (
        <div
          className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)", color: "var(--text-primary)" }}
        >
          <Flag className="h-4 w-4" style={{ color: "rgb(var(--a-800))" }} />
          {ludoSummary(state)}
        </div>
      ) : null}
    </div>
  );
}
