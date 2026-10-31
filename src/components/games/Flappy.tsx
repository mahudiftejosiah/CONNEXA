"use client";

import { useEffect, useRef, useState } from "react";
import { Overlay, Stat, useBest } from "./shared";

const W = 280;
const H = 400;
const GAP = 130;
const PIPE_W = 46;

export default function Flappy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"idle" | "run" | "over">("idle");
  const [score, setScore] = useState(0);
  const best = useBest("flappy", score);

  const st = useRef({ y: H / 2, vy: 0, pipes: [] as { x: number; top: number; passed: boolean }[], alive: false });

  function flap() { st.current.vy = -6.2; }

  function start() {
    const s = st.current;
    s.y = H / 2; s.vy = -4;
    s.pipes = [{ x: W + 40, top: 120, passed: false }];
    s.alive = true;
    setScore(0);
    setPhase("run");
  }

  useEffect(() => {
    if (phase !== "run") return;
    let raf = 0;
    let last = performance.now();
    let spawnIn = 0;

    const loop = (t: number) => {
      const s = st.current;
      const dt = Math.min(40, t - last);
      last = t;
      const m = dt / 16.6;

      s.vy += 0.32 * m;
      s.y += s.vy * m;
      const px = 70, pr = 13;

      if (s.y + pr > H || s.y - pr < 0) {
        s.alive = false;
        setPhase("over");
        return;
      }

      spawnIn -= m;
      if (spawnIn <= 0) {
        s.pipes.push({ x: W + 10, top: 60 + Math.random() * (H - GAP - 160), passed: false });
        spawnIn = 105;
      }
      for (const p of s.pipes) {
        p.x -= 2.3 * m;
        if (!p.passed && p.x + PIPE_W < px) { p.passed = true; setScore((v) => v + 1); }
        const hitX = px + pr > p.x && px - pr < p.x + PIPE_W;
        if (hitX && (s.y - pr < p.top || s.y + pr > p.top + GAP)) {
          s.alive = false;
          setPhase("over");
          return;
        }
      }
      s.pipes = s.pipes.filter((p) => p.x > -PIPE_W);

      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#bfe3f0";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#12372A";
      for (const p of s.pipes) {
        ctx.fillRect(p.x, 0, PIPE_W, p.top);
        ctx.fillRect(p.x, p.top + GAP, PIPE_W, H - p.top - GAP);
      }
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(px, s.y, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d97706";
      ctx.beginPath();
      ctx.moveTo(px - 4, s.y);
      ctx.lineTo(px - 16, s.y - 4);
      ctx.lineTo(px - 4, s.y + 6);
      ctx.fill();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); flap(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <Stat label="Pipes" value={score} />
        <Stat label="Best" value={best} />
      </div>
      <div className="relative w-fit mx-auto">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="rounded-xl max-w-full"
          style={{ touchAction: "none", aspectRatio: `${W}/${H}` }}
          onPointerDown={() => { if (phase === "run") flap(); }}
        />
        {phase === "idle" && <Overlay title="Flappy Wings" sub="Tap the canvas or press space" actionLabel="Play" onAction={start} />}
        {phase === "over" && <Overlay title="Down you go" sub={`${score} pipes · Best ${best}`} actionLabel="Fly again" onAction={start} />}
      </div>
    </div>
  );
}
