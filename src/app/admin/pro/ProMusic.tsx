"use client";

import { useState } from "react";
import { Music, Play, Plus, Trash2, Upload, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { uploadProMedia } from "@/lib/actions/pro";
import { db, useRows, Field, Panel, Notice, Stat, Switch } from "./useRows";
import toast from "react-hot-toast";

type Track = {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  description: string | null;
  source_url: string | null;
  audio_path: string | null;
  cover_path: string | null;
  published: boolean;
  created_at: string;
};

type Playlist = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  published: boolean;
  created_at: string;
};

type PlaylistTrack = { id: string; playlist_id: string; track_id: string; position: number };

function mediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:/i.test(path)) return path;
  return db().storage.from("pro-media").getPublicUrl(path).data.publicUrl;
}

// A file picker that ends in a path inside the one premium bucket, so the
// dashboard never grows a second upload system to keep in step.
function FilePick({ label, accept, folder, onPicked }: {
  label: string;
  accept: string;
  folder: string;
  onPicked: (picked: { path: string; url: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState<string | null>(null);

  async function send(f: File | null) {
    if (!f) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("file", f);
    fd.set("folder", folder);
    const result = await uploadProMedia(fd);
    setBusy(false);
    if ("error" in result) { toast.error(result.error); return; }
    setName(f.name);
    onPicked(result);
    toast.success("Uploaded to pro-media.");
  }

  return (
    <label className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer"
      style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--bg-card)" }}>
      <Upload className="w-4 h-4" />
      <span className="truncate">{busy ? "Uploading…" : name || label}</span>
      <input type="file" accept={accept} className="hidden"
        onChange={(e) => { void send(e.target.files?.[0] ?? null); e.target.value = ""; }} />
    </label>
  );
}

export function ProMusic({ adminId }: { adminId: string }) {
  const tracks = useRows<Track>("music_tracks", { order: "created_at" });
  const playlists = useRows<Playlist>("playlists", { order: "created_at" });
  const links = useRows<PlaylistTrack>("playlist_tracks");
  const [genreFilter, setGenreFilter] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Track | null>(null);
  const [newPlaylist, setNewPlaylist] = useState("");
  const [picking, setPicking] = useState<string | null>(null);

  const genres = Array.from(new Set(tracks.rows.map((t) => t.genre).filter((g): g is string => !!g))).sort();
  const shown = tracks.rows.filter((t) => !genreFilter || t.genre === genreFilter);
  const withFile = tracks.rows.filter((t) => t.audio_path).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Tracks on file" value={tracks.rows.length} />
        <Stat label="Published" value={tracks.rows.filter((t) => t.published).length} />
        <Stat label="With an audio file" value={withFile} />
        <Stat label="Playlists" value={playlists.rows.length} />
      </div>

      <AddTrack adminId={adminId} onAdded={(t) => tracks.set((p) => [t, ...p])} />

      <Panel title="Music Corner tracks" hint="A track with no file plays from its source link; a track with a file plays in the app. Unpublishing hides it from members instantly.">
        <Notice text={tracks.error} />
        <div className="flex flex-wrap items-center gap-2">
          <select className="input text-sm w-auto" value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
            <option value="">All genres</option>
            {genres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <span className="text-xs text-[var(--text-secondary)]">{shown.length} shown</span>
        </div>

        {tracks.loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No tracks here yet — add one above, or paste migration 031.</p>
        ) : (
          <div className="space-y-2">
            {shown.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--bg-main)" }}>
                <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--border)" }}>
                  <Music className="w-4 h-4 text-[var(--text-secondary)]" />
                </span>
                <div className="flex-1 min-w-[12rem]">
                  <p className="font-semibold text-sm truncate">{t.title}</p>
                  <p className="text-xs text-[var(--text-secondary)] truncate">
                    {t.artist}{t.genre ? ` · ${t.genre}` : ""}
                    {!t.audio_path && " · no file uploaded"}
                  </p>
                </div>
                {t.audio_path && (
                  <Button size="sm" variant="ghost" icon={<Play className="w-3.5 h-3.5" />}
                    onClick={() => setPlaying(playing === t.id ? null : t.id)}>
                    {playing === t.id ? "Stop" : "Preview"}
                  </Button>
                )}
                <Switch on={t.published} label={t.title} onChange={async (v) => {
                  setBusy(t.id);
                  const { error } = await db().from("music_tracks").update({ published: v }).eq("id", t.id);
                  setBusy(null);
                  if (error) { toast.error("Could not change that."); return; }
                  tracks.set((p) => p.map((x) => (x.id === t.id ? { ...x, published: v } : x)));
                  toast.success(v ? "Published." : "Hidden from members.");
                }} />
                <Button size="sm" variant="ghost" onClick={() => setDraft({ ...t })}>Edit</Button>
                <Button size="sm" variant="ghost" loading={busy === t.id} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                  onClick={async () => { setBusy(t.id); const ok = await tracks.drop("id", t.id); setBusy(null); if (ok) toast.success("Track deleted."); }}>
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
        {playing && mediaUrl(tracks.rows.find((t) => t.id === playing)?.audio_path ?? null) && (
          <audio controls autoFocus src={mediaUrl(tracks.rows.find((t) => t.id === playing)!.audio_path)!} className="w-full" />
        )}
      </Panel>

      {draft && (
        <Panel title={`Edit “${draft.title}”`} hint="Only what you change here is written back.">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Title"><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
            <Field label="Artist"><input className="input" value={draft.artist} onChange={(e) => setDraft({ ...draft, artist: e.target.value })} /></Field>
            <Field label="Genre"><input className="input" value={draft.genre || ""} onChange={(e) => setDraft({ ...draft, genre: e.target.value || null })} /></Field>
            <Field label="Source link"><input className="input" value={draft.source_url || ""} onChange={(e) => setDraft({ ...draft, source_url: e.target.value || null })} /></Field>
          </div>
          <Field label="Description">
            <textarea className="input min-h-[5rem]" value={draft.description || ""} onChange={(e) => setDraft({ ...draft, description: e.target.value || null })} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <FilePick label="Replace audio file" accept="audio/*" folder="music"
              onPicked={({ path }) => setDraft({ ...draft, audio_path: path })} />
            <FilePick label="Replace cover image" accept="image/*" folder="covers"
              onPicked={({ path }) => setDraft({ ...draft, cover_path: path })} />
          </div>
          <div className="flex gap-2">
            <Button loading={busy === draft.id} icon={<Save className="w-4 h-4" />} onClick={async () => {
              setBusy(draft.id);
              const { data, error } = await db().from("music_tracks").update({
                title: draft.title, artist: draft.artist, genre: draft.genre || null,
                description: draft.description || null, source_url: draft.source_url || null,
                audio_path: draft.audio_path, cover_path: draft.cover_path,
              }).eq("id", draft.id).select().single();
              setBusy(null);
              if (error || !data) { toast.error("Nothing was saved: " + (error?.message ?? "")); return; }
              tracks.set((p) => p.map((x) => (x.id === draft.id ? (data as Track) : x)));
              setDraft(null);
              toast.success("Track updated.");
            }}>Save track</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </Panel>
      )}

      <Panel title="Playlists" hint="Group published tracks into an ordered set. Members see the playlist as a shelf in the Music Corner.">
        <Notice text={playlists.error} />
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1 min-w-[12rem]" placeholder="New playlist name *" value={newPlaylist} onChange={(e) => setNewPlaylist(e.target.value)} />
          <Button loading={false} icon={<Plus className="w-4 h-4" />} onClick={async () => {
            const name = newPlaylist.trim();
            if (name.length < 2) { toast.error("Give the playlist a name."); return; }
            const { data, error } = await db().from("playlists").insert({ name, owner_id: adminId }).select().single();
            if (error || !data) { toast.error("Could not create: " + (error?.message ?? "paste migration 031")); return; }
            playlists.set((p) => [data as Playlist, ...p]);
            setNewPlaylist("");
            toast.success("Playlist created — add tracks to it below.");
          }}>Create playlist</Button>
        </div>

        {playlists.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No playlists yet.</p>
        ) : (
          <div className="space-y-3">
            {playlists.rows.map((pl) => {
              const inList = links.rows
                .filter((l) => l.playlist_id === pl.id)
                .sort((a, b) => a.position - b.position)
                .map((l) => tracks.rows.find((t) => t.id === l.track_id))
                .filter((t): t is Track => !!t);
              return (
                <div key={pl.id} className="p-3 rounded-xl space-y-2" style={{ backgroundColor: "var(--bg-main)" }}>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-semibold text-sm flex-1 min-w-[8rem]">{pl.name}</p>
                    <Switch on={pl.published} label={pl.name} onChange={async (v) => {
                      const { error } = await db().from("playlists").update({ published: v }).eq("id", pl.id);
                      if (error) { toast.error("Could not change that."); return; }
                      playlists.set((p) => p.map((x) => (x.id === pl.id ? { ...x, published: v } : x)));
                    }} />
                    <Button size="sm" variant="ghost" icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      onClick={async () => { if (await playlists.drop("id", pl.id)) toast.success("Playlist deleted."); }}>
                      Delete
                    </Button>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">{inList.length} {inList.length === 1 ? "track" : "tracks"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {inList.map((t) => (
                      <button key={t.id} type="button" onClick={async () => {
                        const link = links.rows.find((l) => l.playlist_id === pl.id && l.track_id === t.id);
                        if (link && await links.drop("id", link.id)) toast.success(`${t.title} removed from ${pl.name}.`);
                      }} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: "var(--border)" }}>
                        {t.title} ×
                      </button>
                    ))}
                  </div>
                  {picking === pl.id ? (
                    <div className="grid sm:grid-cols-2 gap-1.5 max-h-48 overflow-auto p-1">
                      {tracks.rows.map((t) => (
                        <button key={t.id} type="button" className="text-left text-xs px-2 py-1.5 rounded-lg hover:opacity-80"
                          style={{ backgroundColor: "var(--bg-card)", color: "var(--text-primary)" }}
                          onClick={async () => {
                            if (links.rows.some((l) => l.playlist_id === pl.id && l.track_id === t.id)) { toast("That track is already in the playlist."); return; }
                            const position = links.rows.filter((l) => l.playlist_id === pl.id).length;
                            const { data, error } = await db().from("playlist_tracks").insert({ playlist_id: pl.id, track_id: t.id, position }).select().single();
                            if (error || !data) { toast.error("Could not add: " + (error?.message ?? "")); return; }
                            links.set((p) => [...p, data as PlaylistTrack]);
                            toast.success(`${t.title} added.`);
                          }}>
                          {t.title} — {t.artist}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setPicking(pl.id)}>Add tracks</Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function AddTrack({ adminId, onAdded }: { adminId: string; onAdded: (t: Track) => void }) {
  const [form, setForm] = useState({ title: "", artist: "", genre: "", description: "", source_url: "" });
  const [audio, setAudio] = useState<{ path: string; url: string } | null>(null);
  const [cover, setCover] = useState<{ path: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const staged = (audio ? 1 : 0) + (cover ? 1 : 0);

  async function submit() {
    if (form.title.trim().length < 1 || form.artist.trim().length < 1) {
      toast.error("A title and an artist are required.");
      return;
    }
    setBusy(true);
    const { data, error } = await db().from("music_tracks").insert({
      title: form.title.trim(),
      artist: form.artist.trim(),
      genre: form.genre.trim() || null,
      description: form.description.trim() || null,
      source_url: form.source_url.trim() || null,
      audio_path: audio?.path ?? null,
      cover_path: cover?.path ?? null,
      added_by: adminId,
    }).select().single();
    setBusy(false);
    if (error || !data) { toast.error("Could not add the track: " + (error?.message ?? "paste migration 031")); return; }
    onAdded(data as Track);
    setForm({ title: "", artist: "", genre: "", description: "", source_url: "" });
    setAudio(null);
    setCover(null);
    toast.success("Track added to the Music Corner.");
  }

  return (
    <Panel title="Add a track" hint="Use a legally hosted source: upload the file you hold rights to, or point the source link at the page it is licensed from. Nothing is pirated into the app.">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Title *"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Artist *"><input className="input" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} /></Field>
        <Field label="Genre"><input className="input" placeholder="Afrobeats, Jazz, Classical…" value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} /></Field>
        <Field label="Source link"><input className="input" placeholder="https:// the page it is licensed from" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} /></Field>
      </div>
      <Field label="Description"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <FilePick label="Audio file (mp3, m4a, ogg)" accept="audio/*" folder="music" onPicked={setAudio} />
        <FilePick label="Cover image" accept="image/*" folder="covers" onPicked={setCover} />
      </div>
      <div className="flex items-center gap-3">
        <Button loading={busy} onClick={() => void submit()} icon={<Plus className="w-4 h-4" />}>Add track</Button>
        {staged > 0 && <span className="text-xs text-[var(--text-secondary)]">{staged} of 2 files uploaded</span>}
      </div>
    </Panel>
  );
}
