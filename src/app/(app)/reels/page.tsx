import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signPostMedia } from "@/lib/media";
import { ReelsClient } from "./ReelsClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reels" };

export default async function ReelsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get public video posts
  const { data: posts } = await supabase
    .from("posts")
    .select("*, author:profiles(*), media:post_media(*)")
    .eq("visibility", "public")
    .is("group_id", null)
    .order("created_at", { ascending: false })
    .limit(20);

  const videoReels = await signPostMedia(supabase, (posts || []).filter((p) =>
    p.media && p.media.some((m: { type: string }) => m.type === "video")
  ));

  return (
    <div className="min-h-screen bg-black">
      <ReelsClient reels={videoReels as any} currentUserId={user.id} />
    </div>
  );
}
