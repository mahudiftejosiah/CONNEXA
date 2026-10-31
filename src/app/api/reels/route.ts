import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signPostMedia } from "@/lib/media";
import { REEL_POOL, shuffleTake } from "@/lib/reel-pool";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ reels: [] });

  const [embedsRes, postsRes] = await Promise.all([
    supabase.from("reel_embeds").select("*").order("created_at", { ascending: false }).limit(20),
    supabase
      .from("posts")
      .select("id, content, created_at, author_id, visibility, reaction_count, author:profiles(id, username, display_name, avatar_url), media:post_media(id, url, type, position)")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  // Live pool: a fresh shuffle on every request — nothing is stored or downloaded,
  // the videos stream directly from TikTok/YouTube when the embed mounts.
  const pool = shuffleTake(REEL_POOL, 110).map((e) => ({
    kind: "embed" as const,
    id: `pool-${e.platform}-${e.external_id}`,
    platform: e.platform,
    external_id: e.external_id,
    caption: e.caption,
  }));

  // Admin-curated embeds first (table may not exist before migration 012)
  const seen = new Set(pool.map((p) => `${p.platform}:${p.external_id}`));
  const curated = (embedsRes.data || [])
    .filter((e: any) => !seen.has(`${e.platform}:${e.external_id}`))
    .map((e: any) => ({
      kind: "embed" as const,
      id: e.id,
      platform: e.platform as "tiktok" | "youtube",
      external_id: e.external_id,
      caption: e.caption,
    }));

  const posts = postsRes.data || [];
  const withVideo = posts.filter((p: any) => (p.media || []).some((m: any) => m.type === "video")).slice(0, 20);
  await signPostMedia(supabase, withVideo as any[]);

  const videoReels = withVideo.map((p: any) => {
    const video = p.media.find((m: any) => m.type === "video");
    return {
      kind: "post" as const,
      id: p.id,
      content: p.content,
      created_at: p.created_at,
      reaction_count: p.reaction_count,
      video_url: video.url as string,
      author: p.author,
    };
  });

  return NextResponse.json({ reels: [...curated, ...pool, ...videoReels] });
}
