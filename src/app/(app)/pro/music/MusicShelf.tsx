"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Lock, Music2, Pause, Play } from "lucide-react";

type Track = {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  description: string | null;
  source_url: string | null;
  audio_url: string | null;
  cover_url: string | null;
};

export function MusicShelf({
  tracks,
  playlists,
  canListen,
}: {
  tracks: Track[];
  playlists: { id: string; name: string; description: string | null }[];
  canListen: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [broken, setBroken] = useState<string | null>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.play().catch(() => setPlaying(null));
    } else {
      el.pause();
    }
  }, [playing]);

  return (
    <div className="space-y-4">
      <audio ref={audioRef} src={playing ? tracks.find((t) => t.id === playing)?.audio_url ?? undefined : undefined}
        onEnded={() => setPlaying(null)} onError={() => playing && setBroken(playing)} />

      {!canListen && (
        <div className="card p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "var(--brand-gold)" }} />
          <div>
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Preview only</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              The shelf is visible to everyone; playback is a PRO feature.{" "}
              <a href="/pro#upgrade" style={{ color: "var(--brand-gold)", fontWeight: 700 }}>Upgrade to PRO</a>.
            </p>
          </div>
        </div>
      )}

      {tracks.length === 0 ? (
        <div className="card p-8 text-center space-y-2">
          <Music2 className="w-8 h-8 mx-auto" style={{ color: "var(--text-secondary)" }} />
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Nothing published yet</p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Tracks appear here when an administrator adds them in Admin → PRO Management.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tracks.map((t) => {
            const isPlaying = playing === t.id;
            return (
              <li key={t.id} className="card p-3 flex items-center gap-3">
                {t.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.cover_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <span className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--border)" }}>
                    <Music2 className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>{t.title}</p>
                  <p className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>
                    {t.artist}{t.genre ? ` · ${t.genre}` : ""}
                  </p>
                  {t.description && <p className="text-xs line-clamp-2" style={{ color: "var(--text-secondary)" }}>{t.description}</p>}
                  {broken === t.id && (
                    <p className="text-xs font-semibold" style={{ color: "#ef4444" }}>
                      This file is unavailable right now. Report it and an administrator can take it down.
                    </p>
                  )}
                </div>
                {t.audio_url ? (
                  <button
                    type="button"
                    disabled={!canListen}
                    title={canListen ? undefined : "PRO members only"}
                    onClick={() => { setBroken(null); setPlaying(isPlaying ? null : t.id); }}
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                    style={{ background: "var(--brand-green)", color: "#fff" }}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                ) : t.source_url ? (
                  <a href={t.source_url} target="_blank" rel="noopener noreferrer"
                    className="btn-ghost text-sm inline-flex items-center gap-1 flex-shrink-0">
                    Source <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {playlists.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>Playlists</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {playlists.map((p) => (
              <div key={p.id} className="card p-4">
                <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{p.name}</p>
                {p.description && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{p.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
