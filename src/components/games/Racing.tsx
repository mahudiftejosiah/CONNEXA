"use client";

import { useEffect, useRef, useState } from "react";
import { HoldBtn, Overlay, Stat, useBest } from "./shared";

const W = 260;
const H = 400;
const LANES = 3;
const LANE_W = (W - 40) / LANES;

type Car = { lane: number; y: number; color: string };

export default function Racing() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"idle" | "run" | "over">("idle");
  const [score, setScore] = useState(0);
  const best = useBest("racing", score);

  const keys = useRef({ left: false, right: false });
  const st = useRef({ px: 0, cars: [] as Car[], dist: 0, speed: 2.2, spawn: 0, alive: false });

  function start() {
    const s = st.current;
    s.px = W / 2;
    s.cars = [];
    s.dist = 0;
    s.speed = 2.2;
    s.spawn = 0;
    s.alive = true;
    setScore(0);
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
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useEffect(() => {
    if (phase !== "run") return;
    let raf = 0;
    let last = performance.now();

    const laneX = (lane: number) => 20 + LANE_W * lane + LANE_W / 2;

    const loop = (t: number) => {
      const s = st.current;
      const dt = Math.min(40, t - last);
      last = t;
      const mult = dt / 16.6;

      s.speed = Math.min(7, 2.2 + s.dist / 900);
      s.px += ((keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0)) * 4.5 * mult;
      s.px = Math.max(20 + 16, Math.min(W - 20 - 16, s.px));

      s.spawn -= mult;
      if (s.spawn <= 0) {
        const lane = Math.floor(Math.random() * LANES);
        const colors = ["#ef4444", "#3b82f6", "#eab308", "#a855f7", "#10b981"];
        s.cars.push({ lane, y: -60, color: colors[Math.floor(Math.random() * colors.length)] });
        s.spawn = Math.max(22, 55 - s.dist / 60);
      }
      s.cars.forEach((c) => { c.y += s.speed * mult * 1.6; });
      s.cars = s.cars.filter((c) => c.y < H + 60);

      const py = H - 56;
      for (const c of s.cars) {
        const cx = laneX(c.lane);
        if (Math.abs(cx - s.px) < LANE_W * 0.62 && Math.abs(c.y - py) < 42) {
          s.alive = false;
          setPhase("over");
          return;
        }
      }

      s.dist += s.speed * mult * 0.6;
      setScore(Math.floor(s.dist));

      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#26262e";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#3a3a44";
      ctx.fillRect(20, 0, W - 40, H);
      ctx.strokeStyle = "#D6B875";
      ctx.setLineDash([18, 16]);
      ctx.lineDashOffset = -(s.dist * 3) % 34;
      ctx.lineWidth = 3;
      for (let i = 1; i < LANES; i++) {
        ctx.beginPath();
        ctx.moveTo(20 + LANE_W * i, 0);
        ctx.lineTo(20 + LANE_W * i, H);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const c of s.cars) {
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.roundRect(laneX(c.lane) - 15, c.y - 24, 30, 48, 7);
        ctx.fill();
      }
      ctx.fillStyle = "#12372A";
      ctx.beginPath();
      ctx.roundRect(s.px - 15, py - 24, 30, 48, 7);
      ctx.fill();
      ctx.fillStyle = "#D6B875";
      ctx.fillRect(s.px - 10, py - 16, 20, 10);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <Stat label="Distance" value={score} />
        <Stat label="Best" value={best} />
      </div>
      <div className="relative w-fit mx-auto">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="rounded-xl max-w-full"
          style={{ touchAction: "none", aspectRatio: `${W}/${H}` }}
        />
        {phase === "idle" && <Overlay title="Street Racer" sub="Hold arrows or buttons. Don't crash." actionLabel="Play" onAction={start} />}
        {phase === "over" && <Overlay title="Crashed!" sub={`${score} m · Best ${best} m`} actionLabel="Race again" onAction={start} />}
      </div>
      <div className="flex justify-center gap-3">
        <HoldBtn onDown={() => { keys.current.left = true; }} onUp={() => { keys.current.left = false; }}>◀</HoldBtn>
        <HoldBtn onDown={() => { keys.current.right = true; }} onUp={() => { keys.current.right = false; }}>▶</HoldBtn>
      </div>
    </div>
  );
}
