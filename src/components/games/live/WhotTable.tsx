"use client";

import { useState } from "react";
import { Layers, Trophy } from "lucide-react";
import {
  canChallenge,
  declareColor,
  handCount,
  isPlayable,
  lastMoveText,
  pendingPickCount,
  playCard,
  resolvePending,
  whotSummary,
  type WhotCard,
  type WhotColor,
  type WhotState,
} from "@/lib/games/whot";

type PlainColor = Exclude<WhotColor, "whot">;

const CARD_BG: Record<WhotColor, string> = {
  red: "bg-red-500",
  yellow: "bg-yellow-400",
  green: "bg-green-600",
  blue: "bg-blue-600",
  whot: "bg-neutral-900",
};

const CARD_INK: Record<WhotColor, string> = {
  red: "text-white",
  yellow: "text-neutral-900",
  green: "text-white",
  blue: "text-white",
  whot: "text-yellow-300",
};

const CHOICES: { color: PlainColor; label: string; ink: string }[] = [
  { color: "red", label: "Red", ink: "text-white" },
  { color: "yellow", label: "Yellow", ink: "text-neutral-900" },
  { color: "green", label: "Green", ink: "text-white" },
  { color: "blue", label: "Blue", ink: "text-white" },
];

const DOT: Record<WhotColor, string> = {
  red: "#ef4444",
  yellow: "#facc15",
  green: "#16a34a",
  blue: "#2563eb",
  whot: "#fcd34d",
};

function nameOf(card: WhotCard): string {
  return card.color === "whot" ? "Whot" : `${card.color} ${card.number}`;
}

function PlayingCard({
  card,
  size,
  dim = false,
  selected = false,
  onClick,
}: {
  card: WhotCard;
  size: "sm" | "md" | "lg";
  dim?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const box =
    size === "lg"
      ? "w-24 h-32 rounded-2xl"
      : size === "md"
        ? "w-16 h-24 rounded-xl"
        : "w-10 h-14 rounded-lg";
  const pip = size === "lg" ? "text-4xl" : size === "md" ? "text-2xl" : "text-sm";
  const corner = size === "lg" ? "text-xs" : "text-[9px]";
  const banner = size === "lg" ? "text-[11px] px-2.5 py-1" : "text-[8px] px-1.5 py-0.5";

  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      aria-label={nameOf(card)}
      className={`relative shrink-0 border flex flex-col items-center justify-center transition ${box} ${
        CARD_BG[card.color]
      } ${CARD_INK[card.color]} ${dim ? "opacity-30" : ""} ${
        onClick ? "cursor-pointer hover:-translate-y-1 active:scale-95" : "cursor-default"
      }`}
      style={{
        borderColor: "var(--border)",
        transform: selected ? "translateY(-8px)" : undefined,
        boxShadow: selected ? "0 0 0 2px rgb(var(--a-800))" : undefined,
      }}
    >
      <span className={`absolute top-1 left-1.5 font-bold leading-none ${corner}`}>{card.number}</span>
      <span className={`absolute bottom-1 right-1.5 font-bold leading-none rotate-180 ${corner}`}>
        {card.number}
      </span>
      {card.color === "whot" ? (
        <span
          className={`-rotate-12 rounded-full font-black tracking-widest bg-yellow-300 text-neutral-900 ${banner}`}
        >
          WHOT
        </span>
      ) : (
        <span className={`${pip} font-black tabular-nums leading-none`}>{card.number}</span>
      )}
    </button>
  );
}

function CardBack() {
  return (
    <div
      className="w-7 h-10 -ml-4 first:ml-0 rounded-md border shrink-0"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div
        className="m-1 h-[calc(100%-0.5rem)] rounded-sm opacity-70"
        style={{ backgroundColor: "rgb(var(--a-800))" }}
      />
    </div>
  );
}

function ColorPicker({ onPick, label }: { label: string; onPick: (c: PlainColor) => void }) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border p-2"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
    >
      <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {CHOICES.map((c) => (
          <button
            key={c.color}
            type="button"
            onClick={() => onPick(c.color)}
            className={`h-8 min-w-[2.5rem] rounded-lg border px-2 text-[11px] font-bold ${CARD_BG[c.color]} ${c.ink} active:scale-95`}
            style={{ borderColor: "var(--border)" }}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-9 rounded-xl px-3 text-xs font-bold text-white disabled:opacity-40 active:scale-95"
      style={{ backgroundColor: "rgb(var(--a-800))" }}
    >
      {children}
    </button>
  );
}

export default function WhotTable({
  state,
  me,
  onPlay,
  disabled,
}: {
  state: WhotState;
  me: 0 | 1;
  onPlay: (next: WhotState) => void;
  disabled?: boolean;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [whotPicker, setWhotPicker] = useState<number | null>(null);

  const foe = me === 0 ? 1 : 0;
  const hand = state.queue[me] ?? [];
  const top = state.discard.length ? state.discard[state.discard.length - 1] : undefined;
  const myTurn = state.turn === me && state.result === "ongoing" && !disabled;
  const mustDraw = myTurn && state.pending !== "none" && state.pending !== "choosecolor";
  const awaitingColor = myTurn && state.pending === "choosecolor";
  const challengeable = picked != null && myTurn && canChallenge(state, picked);
  const backs = Math.min(handCount(state, foe as 0 | 1), 10);

  function tap(idx: number) {
    const card = hand[idx];
    if (!myTurn || !card || whotPicker !== null) return;
    if (!isPlayable(state, idx)) return;
    if (card.color === "whot") {
      setWhotPicker(idx);
      return;
    }
    if (canChallenge(state, idx)) {
      setPicked((p) => (p === idx ? null : idx));
      return;
    }
    setPicked(null);
    onPlay(playCard(state, idx));
  }

  function choose(color: PlainColor) {
    if (whotPicker !== null) {
      const idx = whotPicker;
      setWhotPicker(null);
      setPicked(null);
      onPlay(playCard(state, idx, { declaredColor: color }));
      return;
    }
    onPlay(declareColor(state, color));
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border p-3 sm:p-4"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
            Opponent
          </span>
          <div className="flex min-w-0">
            {Array.from({ length: backs }, (_, i) => (
              <CardBack key={i} />
            ))}
          </div>
          <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {handCount(state, foe as 0 | 1)}
          </span>
        </div>
        <span
          className="flex shrink-0 items-center gap-1 text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="tabular-nums">{state.stock.length}</span>
        </span>
      </div>

      <div
        className="flex flex-wrap items-center justify-center gap-4 rounded-xl border p-3"
        style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)" }}
      >
        {top ? (
          <PlayingCard card={top} size="lg" />
        ) : (
          <div
            className="w-24 h-32 rounded-2xl border border-dashed"
            style={{ borderColor: "var(--border)" }}
          />
        )}
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-full border"
              style={{ backgroundColor: DOT[state.activeColor], borderColor: "var(--border)" }}
            />
            <span className="text-xs font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
              {state.activeColor}
            </span>
          </div>
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {lastMoveText(state)}
          </span>
        </div>
      </div>

      {state.result === "won" ? (
        <div
          className="flex items-center gap-2 rounded-xl border p-3"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
        >
          <Trophy className="h-4 w-4 shrink-0" style={{ color: "rgb(var(--a-800))" }} />
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {state.winner === me ? "You won this game" : "Your opponent won this game"}
          </p>
        </div>
      ) : (
        <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
          {whotSummary(state, me)}
        </p>
      )}

      {awaitingColor ? (
        <ColorPicker label="Colour after Whot" onPick={choose} />
      ) : whotPicker !== null ? (
        <div className="flex flex-col gap-2">
          <ColorPicker label="Choose a colour" onPick={choose} />
          <button
            type="button"
            onClick={() => setWhotPicker(null)}
            className="self-start text-xs underline"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {mustDraw ? (
          <ActionBtn
            onClick={() => {
              setPicked(null);
              onPlay(resolvePending(state));
            }}
          >
            Pick {pendingPickCount(state)}
          </ActionBtn>
        ) : null}
        {challengeable && picked != null ? (
          <ActionBtn
            onClick={() => {
              const idx = picked;
              setPicked(null);
              onPlay(playCard(state, idx));
            }}
          >
            Challenge with {hand[picked]?.number}
          </ActionBtn>
        ) : null}
        {!myTurn && state.result === "ongoing" ? (
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Waiting for your opponent…
          </span>
        ) : null}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {hand.map((card, idx) => (
          <PlayingCard
            key={card.id}
            card={card}
            size="md"
            dim={!isPlayable(state, idx) || !myTurn}
            selected={picked === idx || whotPicker === idx}
            onClick={isPlayable(state, idx) && myTurn ? () => tap(idx) : undefined}
          />
        ))}
      </div>

      <div
        className="flex gap-1.5 overflow-x-auto rounded-xl border p-2"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
      >
        {state.log.slice(-6).map((line, i) => (
          <span
            key={`${i}-${line}`}
            className="shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[11px]"
            style={{ color: "var(--text-secondary)" }}
          >
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}
