"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useGameUserId } from "./GameUserContext";

const savedKey = (gameId: string) => `connexa_saved_${gameId}`;

/** Synchronous read so a game can mount straight into its last position. */
export function readSaved<T>(gameId: string): T | null {
  try {
    const raw = localStorage.getItem(savedKey(gameId));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Saves an in-progress game (throttled to Supabase, immediate to localStorage) so
 * the same session resumes after the next login, even on another device. Pass
 * `null` to clear it — typically when the run ends or the player restarts.
 */
export function useGameSave<T>(gameId: string, onRemote?: (snap: T) => void) {
  const userId = useGameUserId();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remote = useRef(onRemote);
  remote.current = onRemote;

  useEffect(() => {
    if (!userId) return;
    supabaseRef.current = supabaseRef.current || createClient();
    supabaseRef.current
      .from("game_scores")
      .select("state")
      .eq("user_id", userId)
      .eq("game_id", gameId)
      .maybeSingle()
      .then(({ data }) => {
        const snap = data?.state;
        if (snap) remote.current?.(snap as T);
      });
  }, [userId, gameId]);

  return useCallback((snap: T | null) => {
    try {
      if (snap === null) localStorage.removeItem(savedKey(gameId));
      else localStorage.setItem(savedKey(gameId), JSON.stringify(snap));
    } catch {}
    if (!userId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      supabaseRef.current = supabaseRef.current || createClient();
      if (snap === null) {
        void supabaseRef.current.from("game_scores").update({ state: null }).eq("user_id", userId).eq("game_id", gameId).then(() => {});
      } else {
        void supabaseRef.current.from("game_scores").upsert(
          { user_id: userId, game_id: gameId, state: snap } as any,
          { onConflict: "user_id,game_id" }
        ).then(() => {});
      }
    }, 500);
  }, [gameId, userId]);
}

export function useBest(key: string, score: number) {
  const userId = useGameUserId();
  const storageKey = `connexa_best_${key}`;
  const [best, setBest] = useState(0);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const loadedRef = useRef(false);

  // Local best (works offline / for signed-out visitors).
  useEffect(() => {
    try { setBest(Number(localStorage.getItem(storageKey) || 0)); } catch {}
  }, [storageKey]);

  // Load the server best once, so a signed-in user resumes across devices.
  useEffect(() => {
    if (!userId || loadedRef.current) return;
    loadedRef.current = true;
    supabaseRef.current = supabaseRef.current || createClient();
    supabaseRef.current
      .from("game_scores")
      .select("best")
      .eq("user_id", userId)
      .eq("game_id", key)
      .maybeSingle()
      .then(({ data }) => {
        if (data && typeof data.best === "number") setBest((b) => Math.max(b, data.best));
      });
  }, [userId, key]);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      try { localStorage.setItem(storageKey, String(score)); } catch {}
      if (userId) {
        supabaseRef.current = supabaseRef.current || createClient();
        void supabaseRef.current.from("game_scores").upsert(
          { user_id: userId, game_id: key, best: score, points: score },
          { onConflict: "user_id,game_id" }
        ).then(() => {});
      }
    }
  }, [score, best, storageKey, userId, key]);
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
