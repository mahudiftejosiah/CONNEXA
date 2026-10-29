import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signStoryMedia } from "@/lib/media";
import { AppLayout } from "@/components/layout/AppLayout";
import { StoriesClient } from "./StoriesClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Stories" };

export default async function StoriesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  // Get friend IDs
  const { data: friendships } = await supabase.from("friendships").select("friend_id").eq("user_id", user.id);
  const friendIds = (friendships || []).map((f) => f.friend_id);
  const allIds = [user.id, ...friendIds];

  // Active stories (not expired) from self + friends
  const { data: stories } = await supabase
    .from("stories")
    .select("*, author:profiles(*)")
    .in("author_id", allIds)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  // Which stories has current user viewed?
  const storyIds = (stories || []).map((s) => s.id);
  const { data: views } = storyIds.length
    ? await supabase.from("story_views").select("story_id").eq("viewer_id", user.id).in("story_id", storyIds)
    : { data: [] };
  const viewedSet = new Set((views || []).map((v) => v.story_id));

  const enriched = await signStoryMedia(
    supabase,
    (stories || []).map((s) => ({ ...s, has_viewed: viewedSet.has(s.id) }))
  );

  return (
    <AppLayout>
      <StoriesClient stories={enriched as any} profile={profile} currentUserId={user.id} />
    </AppLayout>
  );
}
