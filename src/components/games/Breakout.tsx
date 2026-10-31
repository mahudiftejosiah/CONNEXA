"use client";

import { useEffect, useRef, useState } from "react";
import { Overlay, Stat, useBest } from "./shared";

const W = 320;
const H = 400;
const COLS = 8;
const ROWS = 5;
const BW = W / COLS;
const BH = 18;

type Brick = { x: number; y: number; alive: boolean; color: string };

export default function Breakout() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"idle" | "run" | "over">("idle");
  const [won, setWon] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const best = useBest("breakout", score);

  const keys = useRef({ left: false, right: false });
  const st = useRef({ px: W / 2 - 30, bx: W / 2, by: H - 60, vx: 2.6, vy: -3, bricks: [] as Brick[], alive: false });

  function start() {
    const colors = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6"];
    const s = st.current;
    s.px = W / 2 - 30;
    s.bx = W / 2; s.by = H - 60;
    s.vx = 2.6; s.vy = -3;
    s.bricks = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        s.bricks.push({ x: c * BW, y: 50 + r * BH, alive: true, color: colors[r] });
      }
    }
    s.alive = true;
    setScore(0);
    setLives(3);
    setWon(false);
    setPhase("run");
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") { e.preventDefault(); keys.current.left = true; }
      if (e.key === "ArrowRight" || e.key === "d") { e.preventDefault(); keys.current.right = true; }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") keys.current.left = false;
      if (e.key === "ArrowRight" || e.key === "d") keys.current.right = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onUp); };
  }, []);

  useEffect(() => {
    if (phase !== "run") return;
    let raf = 0;
    let last = performance.now();
    let livesLeft = 3;

    const loop = (t: number) => {
      const s = st.current;
      const m = Math.min(40, t - last) / 16.6;
      last = t;

      if (keys.current.left) s.px -= 5 * m;
      if (keys.current.right) s.px += 5 * m;
      s.px = Math.max(0, Math.min(W - 60, s.px));

      s.bx += s.vx * m;
      s.by += s.vy * m;
      if (s.bx < 6 || s.bx > W - 6) s.vx = -s.vx;
      if (s.by < 6) s.vy = Math.abs(s.vy);

      if (s.by > H - 26 && s.by < H - 12 && s.bx > s.px && s.bx < s.px + 60 && s.vy > 0) {
        s.vy = -Math.abs(s.vy) * 1.01;
        s.vx += ((s.bx - (s.px + 30)) / 30) * 1.1;
        s.vx = Math.max(-4.5, Math.min(4.5, s.vx));
      }
      if (s.by > H) {
        livesLeft -= 1;
        setLives(livesLeft);
        if (livesLeft <= 0) { setWon(false); setPhase("over"); return; }
        s.bx = W / 2; s.by = H - 60; s.vx = 2.6; s.vy = -3;
      }

      for (const b of s.bricks) {
        if (!b.alive) continue;
        if (s.bx > b.x && s.bx < b.x + BW && s.by > b.y && s.by < b.y + BH) {
          b.alive = false;
          s.vy = -s.vy;
          setScore((v) => v + 10);
          break;
        }
      }
      if (s.bricks.every((b) => !b.alive)) { setWon(true); setPhase("over"); return; }

      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#0e1b16";
      ctx.fillRect(0, 0, W, H);
      for (const b of s.bricks) {
        if (!b.alive) continue;
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x + 2, b.y + 2, BW - 4, BH - 4);
      }
      ctx.fillStyle = "#12372A";
      ctx.beginPath();
      ctx.roundRect(s.px, H - 20, 60, 10, 5);
      ctx.fill();
      ctx.fillStyle = "#D6B875";
      ctx.beginPath();
      ctx.arc(s.bx, s.by, 6, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const movePointer = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = W / rect.width;
    st.current.px = Math.max(0, Math.min(W - 60, (clientX - rect.left) * scale - 30));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <Stat label="Score" value={score} />
        <Stat label="Best" value={best} />
        <Stat label="Lives" value={"♥".repeat(lives)} />
      </div>
      <div
        ref={wrapRef}
        className="relative w-fit mx-auto"
        onPointerMove={(e) => { if (e.buttons) movePointer(e.clientX); }}
        onTouchMove={(e) => movePointer(e.touches[0].clientX)}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="rounded-xl max-w-full"
          style={{ touchAction: "none", aspectRatio: `${W}/${H}` }}
        />
        {phase === "idle" && <Overlay title="Breakout" sub="Move with pointer or ← →" actionLabel="Play" onAction={start} />}
        {phase === "over" && (
          <Overlay
            title={won ? "All bricks cleared!" : "Game over"}
            sub={`Score ${score} · Best ${best}`}
            actionLabel="Play again"
            onAction={start}
          />
        )}
      </div>
    </div>
  );
}
