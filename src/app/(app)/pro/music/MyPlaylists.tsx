"use client";

import { useState } from "react";
import { ListMusic, Plus, X } from "lucide-react";
import toast from "react-hot-toast";
import { createPlaylist, setPlaylistPublished, togglePlaylistTrack } from "@/lib/actions/pro";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Playlist } from "./MusicShelf";

export function MyPlaylists({
  playlists,
  loading,
  error,
  onChanged,
}: {
  playlists: Playlist[];
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}) {
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function create() {
    if (name.trim().length < 2) { toast.error("Give the playlist a name."); return; }
    setSaving(true);
    const res = await createPlaylist(name, description);
    setSaving(false);
    if ("error" in res) { toast.error(res.error); return; }
    setName("");
    setDescription("");
    setComposing(false);
    toast.success("Playlist made and shared with members. Add tracks from the shelf above.");
    onChanged();
  }

  async function publish(p: Playlist) {
    setBusy(p.id);
    const res = await setPlaylistPublished(p.id, !p.published);
    setBusy(null);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(p.published ? "Playlist taken off the community shelf." : "Playlist shared with the community.");
    onChanged();
  }

  async function drop(playlistId: string, trackId: string) {
    setBusy(`${playlistId}:${trackId}`);
    const res = await togglePlaylistTrack(playlistId, trackId);
    setBusy(null);
    if ("error" in res) { toast.error(res.error); return; }
    onChanged();
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold inline-flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <ListMusic className="w-4 h-4" style={{ color: "var(--brand-gold)" }} /> Your playlists
        </h2>
        {!composing && (
          <button type="button" className="btn-ghost text-sm border ml-auto" style={{ borderColor: "var(--border)" }}
            onClick={() => setComposing(true)}>
            <Plus className="w-4 h-4" /> New playlist
          </button>
        )}
      </div>

      {composing && (
        <div className="card p-4 space-y-2">
          <input className="input" maxLength={120} placeholder="Playlist name" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className="input min-h-[64px] resize-y" maxLength={500} placeholder="What is this collection for? (optional)"
            value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary text-sm" disabled={saving} onClick={() => void create()}>Create playlist</button>
            <button type="button" className="btn-ghost text-sm" onClick={() => setComposing(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="card p-4 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : error ? (
        <ProDataNote tone="warn">{error}</ProDataNote>
      ) : playlists.length === 0 ? (
        <div className="card p-6 text-center space-y-1">
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>You have not made a playlist yet</p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Gather tracks from the shelf into a collection of your own. A new playlist is shared with members straight
            away — unpublish it if you would rather keep it private.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {playlists.map((p) => (
            <div key={p.id} className="card p-4 space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold min-w-0 flex-1 truncate" style={{ color: "var(--text-primary)" }}>{p.name}</p>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={p.published
                    ? { background: "var(--brand-gold)", color: "var(--brand-green)" }
                    : { background: "var(--border)", color: "var(--text-secondary)" }}>
                  {p.published ? "Shared" : "Private"}
                </span>
                <button type="button" className="btn-ghost text-xs border flex-shrink-0" style={{ borderColor: "var(--border)" }}
                  disabled={busy === p.id} onClick={() => void publish(p)}>
                  {p.published ? "Unpublish" : "Publish"}
                </button>
              </div>
              {p.description && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{p.description}</p>}
              {p.tracks.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  No tracks yet. Use Add to playlist on a shelf track.
                </p>
              ) : (
                <ol className="space-y-1">
                  {p.tracks.map((t, i) => (
                    <li key={t.id} className="flex items-center gap-2 min-w-0">
                      <span className="text-xs w-4 flex-shrink-0" style={{ color: "var(--text-secondary)" }}>{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate" style={{ color: "var(--text-primary)" }}>{t.title}</span>
                        <span className="block text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                          {t.artist || "Unknown artist"}{t.availability !== "available" ? " · Unavailable" : ""}
                        </span>
                      </span>
                      <button type="button" disabled={busy === `${p.id}:${t.id}`}
                        onClick={() => void drop(p.id, t.id)}
                        className="p-1.5 rounded-lg border flex-shrink-0 disabled:opacity-50"
                        style={{ borderColor: "var(--border)", color: "#ef4444" }}
                        aria-label={`Remove ${t.title} from ${p.name}`}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}