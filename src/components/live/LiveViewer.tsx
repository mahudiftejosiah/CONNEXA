"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Radio, Volume2, VolumeX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clipUrl, isOpen } from "@/lib/live";
import type { LiveSession } from "@/lib/supabase/types";

const POLL_MS = 3000;

/**
 * Plays a broadcast as it happens. Each clip is a plain 5-second WebM, so the
 * player moves to the newest one whenever it lands — a few seconds behind the
 * broadcaster, with no streaming server between them. The overlay covers the
 * whole viewport itself because iPhone Safari will not hand one to a <div>.
 */
export function LiveViewer({ session, authorName, onClose }: {
  session: LiveSession;
  authorName: string;
  onClose: () => void;
}) {
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const videoRef = useRef<HTMLVideoElement>(null);
  // The clip we are on, so a newer upload is the only reason to touch src.
  const seqRef = useRef(session.clip_seq);
  const checking = useRef(false);
  const startedAt = new Date(session.started_at).getTime();

  const [sound, setSound] = useState(false);
  const [ended, setEnded] = useState(session.status !== "live");
  const [waiting, setWaiting] = useState(session.clip_seq === 0);
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));

  const advance = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      const { data } = await supabase
        .from("live_sessions")
        .select("*")
        .eq("id", session.id)
        .single();
      if (!isOpen(data)) {
        setEnded(true);
        return;
      }
      if (data.clip_seq > seqRef.current && data.clip_path) {
        seqRef.current = data.clip_seq;
        setWaiting(false);
        const v = videoRef.current;
        if (v) {
          v.src = clipUrl(supabase, data.clip_path);
          v.play().catch(() => {});
        }
      }
    } finally {
      checking.current = false;
    }
  }, [supabase, session.id]);

  useEffect(() => {
    void advance();
    const poll = setInterval(() => void advance(), POLL_MS);
    const clock = setInterval(() => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [advance, startedAt]);

  // Browsers refuse sound until the viewer asks, so playback starts muted with
  // the choice one tap away.
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = !sound;
  }, [sound]);

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-[90] bg-black flex flex-col">
      <div className="flex items-center gap-2 p-3 absolute top-0 left-0 right-0 z-10"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)" }}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="flex items-center gap-1.5 bg-red-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-white" /> {ended ? "ENDED" : `LIVE ${clock}`}
          </span>
          <p className="text-white text-sm font-semibold truncate">{authorName}</p>
        </div>
        <button onClick={() => setSound((s) => !s)} aria-label={sound ? "Mute" : "Unmute"}
          className="p-2 rounded-xl text-white/80 hover:bg-white/15 flex-shrink-0">
          {sound ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
        <button onClick={onClose} aria-label="Close live video"
          className="p-2 rounded-xl text-white/80 hover:bg-white/15 flex-shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onEnded={() => void advance()}
        onError={() => setWaiting(true)}
        className="w-full flex-1 object-contain bg-black"
      />

      {waiting && !ended && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 pointer-events-none">
          <Radio className="w-10 h-10 animate-pulse" />
          <p className="text-sm">Waiting for the next few seconds of the broadcast…</p>
        </div>
      )}

      {ended && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
          <p className="text-lg font-bold">This live session has ended</p>
          <button onClick={onClose} className="text-sm font-semibold px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25">
            Back
          </button>
        </div>
      )}
    </div>
  );
}
