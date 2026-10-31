"use client";

import { useEffect, useState } from "react";

export function useBest(key: string, score: number) {
  const storageKey = `connexa_best_${key}`;
  const [best, setBest] = useState(0);
  useEffect(() => {
    setBest(Number(localStorage.getItem(storageKey) || 0));
  }, [storageKey]);
  useEffect(() => {
    if (score > best) {
      setBest(score);
      try { localStorage.setItem(storageKey, String(score)); } catch {}
    }
  }, [score, best, storageKey]);
  return best;
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

export function GameBtn({ onClick, children, className = "" }: { onClick: (e: React.PointerEvent | React.MouseEvent) => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onClick(e); }}
      className={`select-none touch-none rounded-xl px-4 py-2 text-sm font-semibold border transition-colors active:scale-95 ${className}`}
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" }}
    >
      {children}
    </button>
  );
}

export function HoldBtn({ onDown, onUp, children }: { onDown: () => void; onUp: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); onDown(); }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={onUp}
      className="select-none touch-none w-16 h-12 rounded-xl font-bold text-lg border flex items-center justify-center active:scale-95"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" }}
    >
      {children}
    </button>
  );
}

export function Overlay({ title, sub, actionLabel, onAction }: { title: string; sub?: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-2 bg-black/60 text-center p-4">
      <p className="text-white text-xl font-bold">{title}</p>
      {sub ? <p className="text-white/80 text-sm">{sub}</p> : null}
      <button
        type="button"
        onClick={onAction}
        className="mt-1 px-5 py-2 rounded-xl font-semibold text-sm text-white"
        style={{ backgroundColor: "rgb(var(--a-800))" }}
      >
        {actionLabel}
      </button>
    </div>
  );
}
