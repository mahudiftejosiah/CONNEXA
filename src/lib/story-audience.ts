import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Whose stories fill the tray: me, the people I am friends with, and everyone
// I follow. Migration 037's stories_select policy already hides a "friends only"
// story from someone who is merely a follower, so widening the author list here
// is safe — the database, not this list, makes the final privacy decision.
// Long IN() lists blow up request URLs, so the list stays at 100 ids with
// friends first: a big following never crowds my actual friends out of the tray.
export async function storyAuthorIds(
  supabase: SupabaseClient<Database>,
  uid: string
): Promise<string[]> {
  const [{ data: friendships }, { data: following }] = await Promise.all([
    supabase.from("friendships").select("friend_id").eq("user_id", uid),
    supabase.from("followers").select("following_id").eq("follower_id", uid),
  ]);
  const ids = new Set<string>([uid]);
  for (const row of friendships || []) ids.add(row.friend_id);
  for (const row of following || []) ids.add(row.following_id);
  return Array.from(ids).slice(0, 100);
}
