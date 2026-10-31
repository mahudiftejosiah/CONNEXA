"use client";

import { useEffect, useRef, useState } from "react";
import { GameBtn, Overlay, Stat, useBest } from "./shared";

export default function WhackAMole() {
  const [phase, setPhase] = useState<"idle" | "run" | "over">("idle");
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(30);
  const [active, setActive] = useState<number | null>(null);
  const [bonk, setBonk] = useState<number | null>(null);
  const best = useBest("whack", score);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  useEffect(() => () => clearTimers(), []);

  function start() {
    clearTimers();
    setScore(0);
    setTime(30);
    setActive(null);
    setPhase("run");

    const countdown = setInterval(() => {
      setTime((t) => {
        if (t <= 1) {
          clearInterval(countdown);
          clearTimers();
          setActive(null);
          setPhase("over");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    timers.current.push(countdown);

    const pop = () => {
      const hole = Math.floor(Math.random() * 9);
      setActive(hole);
      const hide = setTimeout(() => {
        setActive(null);
        if (phaseRef.current === "run") timers.current.push(setTimeout(pop, 300 + Math.random() * 700));
      }, 650 + Math.random() * 550);
      timers.current.push(hide);
    };
    timers.current.push(setTimeout(pop, 500));
  }

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  function whack(i: number) {
    if (phase !== "run") return;
    if (i === active) {
      setScore((s) => s + 1);
      setActive(null);
      setBonk(i);
      setTimeout(() => setBonk(null), 180);
    } else {
      setScore((s) => Math.max(0, s - 1));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <Stat label="Score" value={score} />
          <Stat label="Best" value={best} />
          <Stat label="Time" value={`${time}s`} />
        </div>
        {phase === "run" && <GameBtn onClick={() => { clearTimers(); setPhase("over"); }}>End</GameBtn>}
      </div>
      <div className="relative w-fit mx-auto">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }, (_, i) => (
            <button
              key={i}
              type="button"
              onPointerDown={() => whack(i)}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 flex items-end justify-center overflow-hidden"
              style={{
                borderColor: "var(--border)",
                backgroundColor: bonk === i ? "#fde68a" : "#8b5a2b22",
                touchAction: "none",
              }}
              aria-label={`Hole ${i + 1}`}
            >
              <span
                className="w-12 h-12 rounded-full transition-transform duration-100"
                style={{
                  backgroundColor: active === i ? "#12372A" : "transparent",
                  transform: active === i ? "translateY(0)" : "translateY(100%)",
                }}
              />
            </button>
          ))}
        </div>
        {phase === "idle" && <Overlay title="Whack-a-Mole" sub="Tap the dark mole when it rises. Wrong taps cost 1." actionLabel="Start" onAction={start} />}
        {phase === "over" && <Overlay title="Time!" sub={`Score ${score} · Best ${best}`} actionLabel="Play again" onAction={start} />}
      </div>
    </div>
  );
}
