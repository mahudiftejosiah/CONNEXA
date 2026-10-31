"use client";

import { useEffect, useState } from "react";
import { GameBtn, Stat } from "./shared";

const SYMBOLS = ["♠", "♥", "♦", "♣", "★", "♪", "⚑", "☂"];
const COLORS = ["#12372A", "#dc2626", "#d97706", "#7c3aed", "#059669", "#db2777", "#2563eb", "#ea580c"];

type Card = { id: number; sym: string; color: string; done: boolean };

function deck(): Card[] {
  const cards = SYMBOLS.flatMap((sym, i) => [
    { id: i * 2, sym, color: COLORS[i], done: false },
    { id: i * 2 + 1, sym, color: COLORS[i], done: false },
  ]);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export default function MemoryMatch() {
  const [cards, setCards] = useState<Card[]>(deck);
  const [open, setOpen] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [busy, setBusy] = useState(false);

  const done = cards.every((c) => c.done);

  useEffect(() => {
    if (open.length !== 2) return;
    setBusy(true);
    const [a, b] = open;
    const match = cards[a].sym === cards[b].sym;
    const t = setTimeout(() => {
      if (match) {
        setCards((cs) => cs.map((c, i) => (i === a || i === b ? { ...c, done: true } : c)));
      }
      setOpen([]);
      setBusy(false);
    }, match ? 320 : 700);
    return () => clearTimeout(t);
  }, [open, cards]);

  function flip(i: number) {
    if (busy || cards[i].done || open.includes(i) || open.length === 2) return;
    setMoves((m) => m + (open.length === 1 ? 1 : 0));
    setOpen((o) => [...o, i]);
  }

  function reset() {
    setCards(deck());
    setOpen([]);
    setMoves(0);
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <Stat label="Moves" value={moves} />
          <Stat label="Pairs" value={cards.filter((c) => c.done).length / 2} />
        </div>
        <GameBtn onClick={reset}>Shuffle</GameBtn>
      </div>
      {done && (
        <p className="text-sm font-bold" style={{ color: "#16a34a" }}>
          All matched in {moves} moves!
        </p>
      )}
      <div className="grid grid-cols-4 gap-2 w-fit mx-auto">
        {cards.map((c, i) => {
          const shown = c.done || open.includes(i);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => flip(i)}
              className="w-16 h-16 sm:w-18 sm:h-18 rounded-xl text-2xl font-bold flex items-center justify-center transition-transform active:scale-95"
              style={{
                backgroundColor: shown ? "var(--bg-card)" : "#12372A",
                border: "1px solid var(--border)",
                color: shown ? c.color : "transparent",
                opacity: c.done ? 0.55 : 1,
              }}
              aria-label={shown ? c.sym : "Hidden card"}
            >
              {shown ? c.sym : "?"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
