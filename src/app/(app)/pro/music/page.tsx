import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { proMediaUrl } from "@/lib/media";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProFrame } from "@/components/pro/ProFrame";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { MusicShelf } from "./MusicShelf";
import type { Availability, Playlist, PlaylistTrack, ShelfTrack } from "./MusicShelf";
import { featureEnabled, getProStatus } from "@/lib/pro";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Music Corner" };

export default async function MusicPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [status, enabled] = await Promise.all([
    getProStatus(supabase, user.id),
    featureEnabled(supabase, "music_corner"),
  ]);

  // A star select keeps working when availability is not in the database yet;
  // naming a missing column would fail the whole read.
  const { data, error } = await supabase.from("music_tracks")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(60);

  const tracks: ShelfTrack[] = (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    genre: t.genre,
    description: t.description,
    source_url: t.source_url,
    audio_url: proMediaUrl(supabase, t.audio_path),
    cover_url: proMediaUrl(supabase, t.cover_path),
    availability: t.availability ?? "available",
  }));

  async function tracksById(ids: string[]): Promise<Map<string, PlaylistTrack>> {
    const map = new Map<string, PlaylistTrack>();
    if (!ids.length) return map;
    const { data: rows } = await supabase.from("music_tracks").select("*").in("id", ids);
    for (const t of rows ?? []) {
      map.set(t.id, { id: t.id, title: t.title, artist: t.artist, availability: t.availability ?? "available" });
    }
    return map;
  }

  const { data: playlistData } = await supabase.from("playlists")
    .select("id, name, description, owner_id, published, tracks:playlist_tracks(track_id, position)")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(12);

  const lists = (playlistData ?? []) as unknown as {
    id: string; name: string; description: string | null; owner_id: string; published: boolean;
    tracks: { track_id: string; position: number }[] | null;
  }[];
  const wanted = Array.from(new Set(lists.reduce<string[]>((acc, p) => acc.concat((p.tracks ?? []).map((t) => t.track_id)), [])));
  const byId = await tracksById(wanted);

  const playlists: Playlist[] = lists.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    owner_id: p.owner_id,
    published: p.published,
    tracks: (p.tracks ?? []).slice().sort((a, b) => a.position - b.position).map((t) =>
      byId.get(t.track_id) ?? { id: t.track_id, title: "No longer on the shelf", artist: "", availability: "removed" as Availability }
    ),
  }));

  return (
    <AppLayout>
      <ProFrame title="Music Corner" pro={status.pro} expiresAt={status.expiresAt}
        subtitle="Everything on this shelf was published by the CONNEXA team from a source that is allowed to carry it. Files stream from this project's own storage; a track without permission simply is not here. Members gather what they love into playlists of their own.">
        {!enabled && <ProDataNote tone="warn">An administrator has switched the Music Corner off.</ProDataNote>}
        {error && <ProDataNote>The Music Corner opens when migration 031 is pasted in Supabase.</ProDataNote>}
        <MusicShelf
          tracks={tracks}
          playlists={playlists}
          canListen={status.pro && enabled}
          canCreate={status.pro && enabled}
          currentUserId={user.id}
        />
      </ProFrame>
    </AppLayout>
  );
}