"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  applyMove,
  chessSummary,
  lastMoveText,
  legalMovesFrom,
  type ChessColor,
  type ChessPieceType,
  type ChessState,
} from "@/lib/games/chess";

const GLYPH: Record<ChessColor, Record<ChessPieceType, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};
const FILES = "abcdefgh";
const CHOICES: ChessPieceType[] = ["q", "r", "b", "n"];
const LIGHT = "rgb(var(--a-200))";
const DARK = "rgb(var(--a-600))";

const promotesOn = (c: ChessColor, sq: number) => (c === "w" ? sq < 8 : sq >= 56);
const nameOf = (sq: number) => `${FILES[sq & 7]}${8 - (sq >> 3)}`;

export default function ChessBoard({
  state,
  me,
  onPlay,
  disabled,
}: {
  state: ChessState;
  me: 0 | 1;
  onPlay: (next: ChessState) => void;
  disabled?: boolean;
}) {
  const myColor: ChessColor = me === 0 ? "w" : "b";
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<{ from: number; to: number } | null>(null);

  const over = state.result !== "ongoing";
  const canAct = !disabled && !over && state.turn === myColor;
  const aim = canAct && pending ? pending : null;
  const targets = canAct && selected !== null && !aim ? legalMovesFrom(state, selected) : [];
  const checkSquare = state.check ? state.board.findIndex((p) => p?.t === "k" && p.c === state.turn) : -1;

  function play(from: number, to: number, promo?: ChessPieceType) {
    setSelected(null);
    setPending(null);
    onPlay(applyMove(state, from, to, promo));
  }

  function tap(sq: number) {
    if (aim) return;
    if (selected !== null && targets.includes(sq)) {
      if (state.board[selected]?.t === "p" && promotesOn(state.turn, sq)) setPending({ from: selected, to: sq });
      else play(selected, sq);
      return;
    }
    setSelected(canAct && state.board[sq]?.c === state.turn && sq !== selected ? sq : null);
  }

  const order = Array.from({ length: 64 }, (_, d) => (me === 1 ? 63 - d : d));

  return (
    <div className="space-y-2">
      <div
        className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: state.turn === "w" ? "rgb(var(--b-500))" : "rgb(var(--a-800))" }}
          />
          <span className="truncate">{chessSummary(state)}</span>
        </span>
        <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
          {lastMoveText(state)}
        </span>
      </div>

      <div className="relative">
        <div
          className={`grid grid-cols-8 aspect-square w-full overflow-hidden rounded-xl border ${
            disabled ? "opacity-70" : ""
          }`}
          style={{ borderColor: "var(--border)" }}
        >
          {order.map((sq, d) => {
            const piece = state.board[sq];
            const dark = ((sq >> 3) + (sq & 7)) % 2 === 1;
            const hit = targets.includes(sq);
            const epHit = selected !== null && sq === state.ep && (selected & 7) !== (sq & 7);
            const capture = hit && (!!piece || epHit);
            const traced = state.lastMove?.from === sq || state.lastMove?.to === sq;
            return (
              <button
                key={sq}
                type="button"
                onClick={() => tap(sq)}
                aria-label={nameOf(sq)}
                className="relative flex touch-none select-none items-center justify-center text-2xl leading-none sm:text-3xl"
                style={{ backgroundColor: dark ? DARK : LIGHT }}
              >
                {traced && <span className="absolute inset-0" style={{ backgroundColor: "rgb(var(--b-500) / 0.4)" }} />}
                {selected === sq && (
                  <span className="absolute inset-0" style={{ backgroundColor: "rgb(var(--a-800) / 0.34)" }} />
                )}
                {sq === checkSquare && <span className="absolute inset-0 bg-red-500/45" />}
                {piece && (
                  <span
                    className="relative"
                    style={{
                      color: piece.c === "w" ? "rgb(var(--b-50))" : "rgb(var(--a-900))",
                      textShadow:
                        piece.c === "w" ? "0 1px 2px rgb(0 0 0 / 0.5)" : "0 1px 1px rgb(255 255 255 / 0.35)",
                    }}
                  >
                    {GLYPH[piece.c][piece.t]}
                  </span>
                )}
                {hit && !capture && (
                  <span className="relative h-1/4 w-1/4 rounded-full" style={{ backgroundColor: "rgb(var(--b-600))" }} />
                )}
                {capture && (
                  <span
                    className="pointer-events-none absolute inset-[7%] rounded-full border-4"
                    style={{ borderColor: "rgb(var(--b-600))" }}
                  />
                )}
                {d >= 56 && (
                  <span
                    className="pointer-events-none absolute bottom-0 right-0.5 text-[9px] font-bold sm:text-[10px]"
                    style={{ color: dark ? "rgb(var(--b-100) / 0.9)" : "rgb(var(--a-800) / 0.75)" }}
                  >
                    {FILES[sq & 7]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {aim && (
          <div
            className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 border-t p-2"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            {CHOICES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => play(aim.from, aim.to, t)}
                aria-label={`Promote to ${t}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-xl leading-none transition-transform active:scale-95 sm:h-11 sm:w-11 sm:text-2xl"
                style={{ backgroundColor: "rgb(var(--a-800) / 0.1)", border: "1px solid rgb(var(--a-800) / 0.28)" }}
              >
                <span style={{ color: "rgb(var(--a-800))", textShadow: "0 1px 1px rgb(255 255 255 / 0.4)" }}>
                  {GLYPH[myColor][t]}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPending(null)}
              aria-label="Cancel promotion"
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-transform active:scale-95 sm:h-11 sm:w-11"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {over ? (
        <p className="text-xs font-semibold" style={{ color: "rgb(var(--b-600))" }}>
          {state.result === "checkmate" ? "Game over" : "Draw offered · game over"} · {lastMoveText(state)}
        </p>
      ) : (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {canAct ? "Tap a piece, then a highlighted square." : "Waiting for the opponent's move…"}
        </p>
      )}
    </div>
  );
}
