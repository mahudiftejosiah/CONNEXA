"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, ListPlus, Lock, Music2, Pause, Play } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { togglePlaylistTrack } from "@/lib/actions/pro";
import { Skeleton } from "@/components/ui/Skeleton";
import { ReportButton } from "@/components/pro/ReportButton";
import { MyPlaylists } from "./MyPlaylists";

export type Availability = "available" | "unavailable" | "removed";

export type ShelfTrack = {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  description: string | null;
  source_url: string | null;
  audio_url: string | null;
  cover_url: string | null;
  availability: Availability;
};

export type PlaylistTrack = { id: string; title: string; artist: string; availability: Availability };

export type Playlist = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  published: boolean;
  tracks: PlaylistTrack[];
};

type PlaylistRow = {
  id: string; name: string; description: string | null; owner_id: string; published: boolean;
  tracks: { track_id: string; position: number }[] | null;
};

export function MusicShelf({
  tracks,
  playlists,
  canListen,
  canCreate,
  currentUserId,
}: {
  tracks: ShelfTrack[];
  playlists: Playlist[];
  canListen: boolean;
  canCreate: boolean;
  currentUserId: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [mine, setMine] = useState<Playlist[]>([]);
  const [mineLoading, setMineLoading] = useState(true);
  const [mineError, setMineError] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => setReady(true), []);

  const loadMine = useCallback(async () => {
    if (!canCreate) { setMineLoading(false); return; }
    setMineLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.from("playlists")
      .select("id, name, description, published, owner_id, tracks:playlist_tracks(track_id, position)")
      .eq("owner_id", currentUserId)
      .order("created_at", { ascending: false });
    if (error) {
      setMineError("Playlists need migration 031.");
      setMine([]);
      setMineLoading(false);
      return;
    }

    const rows = (data ?? []) as unknown as PlaylistRow[];
    const ids: string[] = [];
    for (const p of rows) for (const t of p.tracks ?? []) ids.push(t.track_id);
    const wanted = Array.from(new Set(ids));

    const byId = new Map<string, PlaylistTrack>();
    if (wanted.length) {
      // A star select keeps working when availability is not in the database yet.
      const { data: found } = await supabase.from("music_tracks").select("*").in("id", wanted);
      for (const t of found ?? []) {
        byId.set(t.id, { id: t.id, title: t.title, artist: t.artist, availability: t.availability ?? "available" });
      }
    }

    setMine(rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      owner_id: p.owner_id,
      published: p.published,
      tracks: (p.tracks ?? []).slice().sort((a, b) => a.position - b.position).map((t) =>
        byId.get(t.track_id) ?? { id: t.track_id, title: "No longer on the shelf", artist: "", availability: "removed" as Availability }
      ),
    })));
    setMineError(null);
    setMineLoading(false);
  }, [canCreate, currentUserId]);

  useEffect(() => { void loadMine(); }, [loadMine]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.play().catch(() => setPlaying(null));
    } else {
      el.pause();
    }
  }, [playing]);

  async function toggle(playlistId: string, trackId: string) {
    setToggling(`${playlistId}:${trackId}`);
    const res = await togglePlaylistTrack(playlistId, trackId);
    setToggling(null);
    if ("error" in res) { toast.error(res.error); return; }
    await loadMine();
  }

  const shared = playlists.filter((p) => p.owner_id !== currentUserId);

  return (
    <div className="space-y-4">
      <audio ref={audioRef} src={playing ? tracks.find((t) => t.id === playing && t.availability === "available")?.audio_url ?? undefined : undefined}
        onEnded={() => setPlaying(null)} onError={() => playing && setBroken(playing)} />

      {!canListen && (
        <div className="card p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "var(--brand-gold)" }} />
          <div>
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Preview only</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              The shelf is visible to everyone; playback is a PRO feature.{" "}
              <a href="/pro#upgrade" style={{ color: "var(--brand-gold-text)", fontWeight: 700 }}>Upgrade to PRO</a>.
            </p>
          </div>
        </div>
      )}

      {!ready ? (
        <ul className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="card p-3 flex items-center gap-3">
              <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
            </li>
          ))}
        </ul>
      ) : tracks.length === 0 ? (
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
            const gone = t.availability !== "available";
            return (
              <li key={t.id} className="card p-3 space-y-2">
                <div className="flex items-center gap-3">
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
                    {gone && (
                      <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                        This track is unavailable, so there is nothing to play.
                      </p>
                    )}
                    {broken === t.id && !gone && (
                      <p className="text-xs font-semibold" style={{ color: "#ef4444" }}>
                        This file is unavailable right now. Report it and an administrator can take it down.
                      </p>
                    )}
                  </div>
                  {gone ? (
                    <span className="text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0"
                      style={{ background: "var(--border)", color: "var(--text-secondary)" }}>
                      Unavailable
                    </span>
                  ) : t.audio_url ? (
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
                  {canCreate && (
                    <button
                      type="button"
                      disabled={gone}
                      title={gone ? "This track is unavailable" : "Add to playlist"}
                      aria-label={gone ? "This track is unavailable" : `Add ${t.title} to a playlist`}
                      aria-expanded={pickerFor === t.id}
                      onClick={() => setPickerFor(pickerFor === t.id ? null : t.id)}
                      className="w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                      style={{ borderColor: "var(--border)", color: "var(--brand-gold-text)" }}
                    >
                      <ListPlus className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {pickerFor === t.id && (
                  <div className="rounded-xl border p-2 space-y-1" style={{ borderColor: "var(--border)" }}>
                    {mineLoading ? (
                      <Skeleton className="h-7 w-full" />
                    ) : mineError ? (
                      <p className="text-xs font-semibold px-1 py-1.5" style={{ color: "#ef4444" }}>{mineError}</p>
                    ) : mine.length === 0 ? (
                      <p className="text-xs px-1 py-1.5" style={{ color: "var(--text-secondary)" }}>
                        No playlists yet. Make one under Your playlists below.
                      </p>
                    ) : (
                      mine.map((p) => {
                        const inList = p.tracks.some((x) => x.id === t.id);
                        return (
                          <button key={p.id} type="button" disabled={toggling === `${p.id}:${t.id}`}
                            onClick={() => void toggle(p.id, t.id)}
                            className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left disabled:opacity-50"
                            style={{ background: inList ? "rgb(var(--a-800) / 0.08)" : "transparent" }}>
                            <span className="min-w-0 flex-1 text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{p.name}</span>
                            <span className="text-xs font-bold flex-shrink-0" style={{ color: inList ? "#ef4444" : "var(--brand-gold-text)" }}>
                              {inList ? "Remove" : "Add"}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}

                <ReportButton entityType="music" entityId={t.id} />
              </li>
            );
          })}
        </ul>
      )}

      {canCreate && (
        <MyPlaylists playlists={mine} loading={mineLoading} error={mineError} onChanged={() => void loadMine()} />
      )}

      {shared.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>Shared by members</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {shared.map((p) => (
              <div key={p.id} className="card p-4 space-y-1.5 min-w-0">
                <p className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>{p.name}</p>
                {p.description && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{p.description}</p>}
                {p.tracks.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>No tracks in this playlist yet.</p>
                ) : (
                  <ol className="space-y-0.5">
                    {p.tracks.map((t, i) => (
                      <li key={t.id} className="text-xs flex items-center gap-1.5 min-w-0">
                        <span className="flex-shrink-0" style={{ color: "var(--text-secondary)" }}>{i + 1}.</span>
                        <span className="truncate" style={{ color: "var(--text-primary)" }}>{t.title}</span>
                        <span className="truncate" style={{ color: "var(--text-secondary)" }}>{t.artist}</span>
                        {t.availability !== "available" && (
                          <span className="flex-shrink-0 font-bold" style={{ color: "var(--text-secondary)" }}>Unavailable</span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}