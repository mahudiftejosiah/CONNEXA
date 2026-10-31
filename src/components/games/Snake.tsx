"use client";

import { useEffect, useRef, useState } from "react";
import { GameBtn, HoldBtn, Overlay, Stat, useBest } from "./shared";

const N = 17;
const CELL = 20;

type P = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";
const VEC: Record<Dir, P> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

export default function Snake() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"idle" | "run" | "over">("idle");
  const [score, setScore] = useState(0);
  const best = useBest("snake", score);

  const st = useRef({ snake: [] as P[], dir: "right" as Dir, next: "right" as Dir, food: { x: 8, y: 8 } as P, alive: false });

  function start() {
    const s = st.current;
    s.snake = [{ x: 4, y: 8 }, { x: 3, y: 8 }, { x: 2, y: 8 }];
    s.dir = "right"; s.next = "right";
    s.food = { x: 10, y: 8 };
    s.alive = true;
    setScore(0);
    setPhase("run");
  }

  function turn(d: Dir) {
    const s = st.current;
    const opp: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
    if (opp[d] !== s.dir) s.next = d;
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
      const d = map[e.key];
      if (d) { e.preventDefault(); turn(d); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (phase !== "run") return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const touch = { x: 0, y: 0, on: false };

    const step = () => {
      const s = st.current;
      s.dir = s.next;
      const head = { x: s.snake[0].x + VEC[s.dir].x, y: s.snake[0].y + VEC[s.dir].y };
      const hitWall = head.x < 0 || head.y < 0 || head.x >= N || head.y >= N;
      const willEat = head.x === s.food.x && head.y === s.food.y;
      // the tail cell vacates this step unless we are eating — moving into it is legal
      const hitSelf = s.snake.some((p, i) => (willEat || i < s.snake.length - 1) && p.x === head.x && p.y === head.y);
      if (hitWall || hitSelf) {
        s.alive = false;
        setPhase("over");
        return;
      }
      s.snake.unshift(head);
      if (head.x === s.food.x && head.y === s.food.y) {
        setScore((v) => v + 1);
        let f: P;
        do {
          f = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
        } while (s.snake.some((p) => p.x === f.x && p.y === f.y));
        s.food = f;
      } else {
        s.snake.pop();
      }
    };

    const draw = () => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const s = st.current;
      ctx.fillStyle = "#0e1b16";
      ctx.fillRect(0, 0, N * CELL, N * CELL);
      ctx.fillStyle = "#D6B875";
      ctx.fillRect(s.food.x * CELL + 4, s.food.y * CELL + 4, CELL - 8, CELL - 8);
      s.snake.forEach((p, i) => {
        ctx.fillStyle = i === 0 ? "#22c55e" : "#16a34a";
        ctx.fillRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2);
      });
    };

    const loop = (t: number) => {
      if (!st.current.alive) return;
      acc += Math.min(100, t - last);
      last = t;
      const speed = Math.max(70, 140 - score * 3);
      while (acc >= speed) {
        acc -= speed;
        step();
        if (!st.current.alive) return;
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const cv = canvasRef.current;
    const onDown = (e: TouchEvent) => { touch.x = e.touches[0].clientX; touch.y = e.touches[0].clientY; touch.on = true; };
    const onUp = (e: TouchEvent) => {
      if (!touch.on) return;
      touch.on = false;
      const dx = e.changedTouches[0].clientX - touch.x;
      const dy = e.changedTouches[0].clientY - touch.y;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    };
    cv?.addEventListener("touchstart", onDown, { passive: true });
    cv?.addEventListener("touchend", onUp, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      cv?.removeEventListener("touchstart", onDown);
      cv?.removeEventListener("touchend", onUp);
    };
  }, [phase, score]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <Stat label="Score" value={score} />
        <Stat label="Best" value={best} />
      </div>
      <div className="relative w-fit mx-auto">
        <canvas
          ref={canvasRef}
          width={N * CELL}
          height={N * CELL}
          className="rounded-xl max-w-full"
          style={{ touchAction: "none", aspectRatio: "1" }}
        />
        {phase === "idle" && <Overlay title="Snake" sub="Arrows / WASD, swipe or buttons" actionLabel="Play" onAction={start} />}
        {phase === "over" && <Overlay title="Game over" sub={`Score ${score} · Best ${best}`} actionLabel="Play again" onAction={start} />}
      </div>
      <div className="flex flex-col items-center gap-2">
        <HoldBtn onDown={() => turn("up")} onUp={() => {}}>▲</HoldBtn>
        <div className="flex gap-2">
          <HoldBtn onDown={() => turn("left")} onUp={() => {}}>◀</HoldBtn>
          <HoldBtn onDown={() => turn("down")} onUp={() => {}}>▼</HoldBtn>
          <HoldBtn onDown={() => turn("right")} onUp={() => {}}>▶</HoldBtn>
        </div>
        {phase === "run" && <GameBtn onClick={() => setPhase("idle")}>Stop</GameBtn>}
      </div>
    </div>
  );
}
