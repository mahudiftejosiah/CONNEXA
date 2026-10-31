"use client";

import { useEffect, useRef, useState } from "react";
import { Overlay, Stat } from "./shared";

const W = 340;
const H = 240;
const PH = 54;
const PW = 9;
const WIN = 5;

export default function Pong() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"idle" | "run" | "over">("idle");
  const [won, setWon] = useState(false);
  const [finalScore, setFinalScore] = useState("");

  const keys = useRef({ up: false, down: false });
  const st = useRef({ py: H / 2 - PH / 2, cy: H / 2 - PH / 2, bx: W / 2, by: H / 2, vx: 2.6, vy: 1.6, me: 0, cpu: 0, alive: false });

  function start() {
    const s = st.current;
    s.py = H / 2 - PH / 2; s.cy = H / 2 - PH / 2;
    s.bx = W / 2; s.by = H / 2;
    s.vx = 2.6; s.vy = (Math.random() > 0.5 ? 1 : -1) * 1.6;
    s.me = 0; s.cpu = 0;
    s.alive = true;
    setPhase("run");
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w") { e.preventDefault(); keys.current.up = true; }
      if (e.key === "ArrowDown" || e.key === "s") { e.preventDefault(); keys.current.down = true; }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w") keys.current.up = false;
      if (e.key === "ArrowDown" || e.key === "s") keys.current.down = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onUp); };
  }, []);

  useEffect(() => {
    if (phase !== "run") return;
    let raf = 0;
    let last = performance.now();

    const resetBall = (toRight: boolean) => {
      const s = st.current;
      s.bx = W / 2; s.by = H / 2;
      s.vx = (toRight ? 1 : -1) * 2.6;
      s.vy = (Math.random() * 2 - 1) * 2;
    };

    const loop = (t: number) => {
      const s = st.current;
      const m = Math.min(40, t - last) / 16.6;
      last = t;

      if (keys.current.up) s.py -= 4.4 * m;
      if (keys.current.down) s.py += 4.4 * m;
      s.py = Math.max(0, Math.min(H - PH, s.py));

      s.cy += Math.max(-3.1, Math.min(3.1, s.by - PH / 2 - s.cy)) * 0.085 * m * 3;
      s.cy = Math.max(0, Math.min(H - PH, s.cy));

      s.bx += s.vx * m;
      s.by += s.vy * m;
      if (s.by < 6 || s.by > H - 6) s.vy = -s.vy;

      if (s.bx - 7 < 20 + PW && s.bx > 12 && s.by > s.py - 6 && s.by < s.py + PH + 6 && s.vx < 0) {
        s.vx = Math.abs(s.vx) * 1.05;
        s.vy += (s.by - (s.py + PH / 2)) * 0.06;
      }
      if (s.bx + 7 > W - 20 - PW && s.bx < W - 12 && s.by > s.cy - 6 && s.by < s.cy + PH + 6 && s.vx > 0) {
        s.vx = -Math.abs(s.vx) * 1.03;
        s.vy += (s.by - (s.cy + PH / 2)) * 0.06;
      }

      if (s.bx < 0) {
        s.cpu += 1;
        if (s.cpu >= WIN) { setWon(false); setFinalScore(`You ${s.me} — CPU ${s.cpu}`); setPhase("over"); return; }
        resetBall(true);
      }
      if (s.bx > W) {
        s.me += 1;
        if (s.me >= WIN) { setWon(true); setFinalScore(`You ${s.me} — CPU ${s.cpu}`); setPhase("over"); return; }
        resetBall(false);
      }

      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#0e1b16";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(214,184,117,0.5)";
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#12372A";
      ctx.fillRect(20, s.py, PW, PH);
      ctx.fillStyle = "#D6B875";
      ctx.fillRect(W - 20 - PW, s.cy, PW, PH);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(s.bx, s.by, 6, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const movePointer = (clientY: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = H / rect.height;
    st.current.py = Math.max(0, Math.min(H - PH, (clientY - rect.top) * scale - PH / 2));
  };

  return (
    <div className="space-y-3">
      <Stat label="First to" value={`${WIN} points`} />
      <div
        ref={wrapRef}
        className="relative w-fit mx-auto"
        onPointerMove={(e) => { if (e.buttons) movePointer(e.clientY); }}
        onTouchMove={(e) => movePointer(e.touches[0].clientY)}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="rounded-xl max-w-full"
          style={{ touchAction: "none", aspectRatio: `${W}/${H}` }}
        />
        {phase === "idle" && <Overlay title="Pong Duel" sub="Drag on the left side, or use ↑ ↓" actionLabel="Play" onAction={start} />}
        {phase === "over" && <Overlay title={won ? "You win!" : "CPU wins"} sub={finalScore} actionLabel="Rematch" onAction={start} />}
      </div>
    </div>
  );
}
