"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Mic } from "lucide-react";

const BARS = 40;

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

// The bars are the recording's own amplitude, sampled out of the decoded audio,
// so the shape belongs to this note rather than to a decoration.
export function VoiceNote({ src, mine, durationHint }: {
  src: string;
  mine: boolean;
  durationHint?: number | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationHint ?? 0);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const Ctor: typeof AudioContext | undefined =
      typeof window === "undefined" ? undefined
        : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error("fetch");
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        if (cancelled) return;
        const channel = buf.getChannelData(0);
        const step = Math.max(1, Math.floor(channel.length / BARS));
        const out: number[] = [];
        for (let i = 0; i < BARS; i++) {
          let peak = 0;
          const start = i * step;
          for (let j = start; j < start + step && j < channel.length; j += 8) {
            const v = Math.abs(channel[j]);
            if (v > peak) peak = v;
          }
          out.push(peak);
        }
        const loudest = out.reduce((a, b) => Math.max(a, b), 0) || 1;
        setPeaks(out.map((p) => Math.max(0.12, p / loudest)));
        if (Number.isFinite(buf.duration) && buf.duration > 0) setDuration(buf.duration);
      } catch {
        /* The plain track below still plays and seeks without a waveform. */
      } finally {
        void ctx.close().catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    function onTime() { setTime(audio!.currentTime); }
    function onMeta() {
      // MediaRecorder writes a stream without a duration header. Parking the
      // playhead past the end forces the browser to measure the real length.
      if (!Number.isFinite(audio!.duration)) { audio!.currentTime = 1e6; return; }
      setDuration(audio!.duration);
    }
    function onSeeked() {
      if (Number.isFinite(audio!.duration) && audio!.currentTime > audio!.duration - 0.2 && !playing) {
        audio!.currentTime = 0;
        setTime(0);
      }
    }
    function onEnd() { setPlaying(false); setTime(0); audio!.currentTime = 0; }
    function onError() { setBroken(true); }
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("seeked", onSeeked);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("seeked", onSeeked);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onError);
    };
  }, [playing]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); return; }
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setBroken(true);
    }
  }

  function seek(event: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    const box = trackRef.current;
    if (!audio || !box || !duration) return;
    const rect = box.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setTime(audio.currentTime);
  }

  const progress = duration > 0 ? Math.min(1, time / duration) : 0;
  const ink = mine ? "#ffffff" : "rgb(var(--a-800))";
  const faint = mine ? "rgba(255,255,255,0.35)" : "var(--border)";

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 min-w-[13rem] max-w-[19rem]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-95"
        style={{ backgroundColor: mine ? "rgba(255,255,255,0.18)" : "rgb(var(--a-800))", color: mine ? "#fff" : "#fff" }}
      >
        {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div
          ref={trackRef}
          onClick={seek}
          role="slider"
          aria-label="Seek within the voice note"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          tabIndex={0}
          onKeyDown={(e) => {
            const audio = audioRef.current;
            if (!audio || !duration) return;
            if (e.key === "ArrowRight") audio.currentTime = Math.min(duration, audio.currentTime + 2);
            if (e.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 2);
          }}
          className="flex items-center gap-[2px] h-8 cursor-pointer"
        >
          {peaks
            ? peaks.map((p, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-full transition-colors"
                  style={{
                    height: `${Math.round(p * 26) + 4}px`,
                    backgroundColor: i / BARS <= progress ? ink : faint,
                  }}
                />
              ))
            : (
                <span className="relative block w-full h-1.5 rounded-full" style={{ backgroundColor: faint }}>
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progress * 100}%`, backgroundColor: ink }} />
                </span>
              )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] mt-0.5" style={{ color: mine ? "rgba(255,255,255,0.75)" : "var(--text-secondary)" }}>
          <Mic className="w-3 h-3 flex-shrink-0" />
          <span>{broken ? "Audio unavailable" : `${clock(time)} / ${clock(duration)}`}</span>
        </div>
      </div>
    </div>
  );
}