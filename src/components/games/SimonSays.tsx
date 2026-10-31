"use client";

import { useEffect, useRef, useState } from "react";
import { Overlay, Stat, useBest } from "./shared";

const PADS = [
  { on: "#22c55e", off: "#14532d" },
  { on: "#ef4444", off: "#7f1d1d" },
  { on: "#eab308", off: "#713f12" },
  { on: "#3b82f6", off: "#1e3a8a" },
];

export default function SimonSays() {
  const [phase, setPhase] = useState<"idle" | "show" | "input" | "over">("idle");
  const [seq, setSeq] = useState<number[]>([]);
  const [lit, setLit] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const level = seq.length;
  const failedLevel = phase === "over" ? Math.max(0, level - 1) : level;
  const best = useBest("simon", failedLevel);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stepRef = useRef(0);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function playSequence(s: number[]) {
    setPhase("show");
    stepRef.current = 0;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    s.forEach((pad, i) => {
      timers.current.push(setTimeout(() => setLit(pad), i * 620 + 350));
      timers.current.push(setTimeout(() => setLit(null), i * 620 + 350 + 380));
    });
    timers.current.push(setTimeout(() => {
      setPhase("input");
      setStep(0);
      stepRef.current = 0;
    }, s.length * 620 + 400));
  }

  function press(pad: number) {
    if (phase !== "input") return;
    setLit(pad);
    timers.current.push(setTimeout(() => setLit(null), 200));
    if (pad === seq[stepRef.current]) {
      stepRef.current += 1;
      setStep(stepRef.current);
      if (stepRef.current === seq.length) {
        const ns = [...seq, Math.floor(Math.random() * 4)];
        timers.current.push(setTimeout(() => {
          setSeq(ns);
          playSequence(ns);
        }, 700));
      }
    } else {
      setPhase("over");
    }
  }

  function restart() {
    timers.current.forEach(clearTimeout);
    setStep(0);
    stepRef.current = 0;
    const s = [Math.floor(Math.random() * 4)];
    setSeq(s);
    playSequence(s);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <Stat label="Level" value={level} />
        <Stat label="Best" value={best} />
        <Stat label="Progress" value={`${step}/${seq.length}`} />
      </div>
      <div className="relative w-fit mx-auto">
        <div className="grid grid-cols-2 gap-3">
          {PADS.map((p, i) => (
            <button
              key={i}
              type="button"
              onPointerDown={() => press(i)}
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl transition-transform active:scale-95"
              style={{
                backgroundColor: lit === i ? p.on : p.off,
                boxShadow: lit === i ? `0 0 24px ${p.on}` : "none",
                touchAction: "none",
              }}
              aria-label={`Pad ${i + 1}`}
            />
          ))}
        </div>
        {phase === "idle" && <Overlay title="Simon Pulse" sub="Watch the pattern, then repeat it" actionLabel="Start" onAction={restart} />}
        {phase === "over" && <Overlay title="Wrong pad!" sub={`Reached level ${level}`} actionLabel="Try again" onAction={restart} />}
      </div>
      {phase === "show" && <p className="text-sm text-center font-semibold" style={{ color: "var(--text-secondary)" }}>Watch…</p>}
      {phase === "input" && <p className="text-sm text-center font-semibold" style={{ color: "#16a34a" }}>Your turn!</p>}
    </div>
  );
}
