import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signPostMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ reels: [] });

  const { data: posts } = await supabase
    .from("posts")
    .select("id, content, created_at, author_id, visibility, reaction_count, author:profiles(id, username, display_name, avatar_url), media:post_media(id, url, type, position)")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(80);

  const withVideo = (posts || []).filter((p: any) => (p.media || []).some((m: any) => m.type === "video")).slice(0, 30);
  await signPostMedia(supabase, withVideo as any[]);

  const reels = withVideo.map((p: any) => {
    const video = p.media.find((m: any) => m.type === "video");
    return {
      id: p.id,
      content: p.content,
      created_at: p.created_at,
      reaction_count: p.reaction_count,
      video_url: video.url as string,
      author: p.author,
    };
  });

  return NextResponse.json({ reels });
}
