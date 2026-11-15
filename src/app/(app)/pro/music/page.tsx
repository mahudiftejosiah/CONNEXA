import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { proMediaUrl } from "@/lib/media";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProFrame } from "@/components/pro/ProFrame";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { MusicShelf } from "./MusicShelf";
import { featureEnabled, getProStatus } from "@/lib/pro";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Music Corner" };

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

export default async function MusicPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [status, enabled] = await Promise.all([
    getProStatus(supabase, user.id),
    featureEnabled(supabase, "music_corner"),
  ]);

  const { data, error } = await supabase.from("music_tracks")
    .select("id, title, artist, genre, description, source_url, audio_path, cover_path")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(60);

  const tracks: Track[] = (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    genre: t.genre,
    description: t.description,
    source_url: t.source_url,
    audio_url: proMediaUrl(supabase, t.audio_path),
    cover_url: proMediaUrl(supabase, t.cover_path),
  }));

  const { data: playlists } = await supabase.from("playlists")
    .select("id, name, description")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <AppLayout>
      <ProFrame title="Music Corner" pro={status.pro} expiresAt={status.expiresAt}
        subtitle="Everything on this shelf was published by the CONNEXA team from a source that is allowed to carry it. Files stream from this project's own storage; a track without permission simply is not here.">
        {!enabled && <ProDataNote tone="warn">An administrator has switched the Music Corner off.</ProDataNote>}
        {error && <ProDataNote>The Music Corner opens when migration 031 is pasted in Supabase.</ProDataNote>}
        <MusicShelf
          tracks={tracks}
          playlists={(playlists ?? []).map((p) => ({ id: p.id, name: p.name, description: p.description }))}
          canListen={status.pro && enabled}
        />
      </ProFrame>
    </AppLayout>
  );
}
