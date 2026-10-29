import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signPostMedia, signStoryMedia } from "@/lib/media";
import { attachSharedPosts } from "@/lib/shared-posts";
import { AppLayout } from "@/components/layout/AppLayout";
import { FeedClient } from "./FeedClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Home Feed" };

export default async function FeedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  const { data: friendships } = await supabase
    .from("friendships").select("friend_id").eq("user_id", user.id);
  const friendIds = (friendships || []).map((f) => f.friend_id);

  // Active stories from self + friends (shown as a tray under the composer)
  const { data: stories } = await supabase
    .from("stories")
    .select("*, author:profiles(*)")
    .in("author_id", [user.id, ...friendIds])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  const storyIds = (stories || []).map((s) => s.id);
  const { data: storyViews } = storyIds.length
    ? await supabase.from("story_views").select("story_id").eq("viewer_id", user.id).in("story_id", storyIds)
    : { data: [] };
  const storyViewedSet = new Set((storyViews || []).map((v) => v.story_id));
  const feedStories = await signStoryMedia(
    supabase,
    (stories || []).map((s) => ({ ...s, has_viewed: storyViewedSet.has(s.id) }))
  );

  const feedFilter = friendIds.length > 0
    ? `visibility.eq.public,and(visibility.eq.friends,author_id.in.(${[user.id, ...friendIds].join(",")})),author_id.eq.${user.id}`
    : `visibility.eq.public,author_id.eq.${user.id}`;

  const { data: posts } = await supabase
    .from("posts")
    .select(`
      *,
      author:profiles(*),
      media:post_media(*)
    `)
    .is("group_id", null)
    .or(feedFilter)
    .order("created_at", { ascending: false })
    .limit(20);

  const postIds = (posts || []).map((p) => p.id);
  const [reactionsRes, savedRes] = postIds.length
    ? await Promise.all([
        supabase.from("reactions").select("post_id, type").eq("user_id", user.id).in("post_id", postIds),
        supabase.from("saved_posts").select("post_id").eq("user_id", user.id).in("post_id", postIds),
      ])
    : [{ data: [] }, { data: [] }];

  const reactionMap = Object.fromEntries(
    (reactionsRes.data || []).map((r) => [r.post_id, r.type])
  );
  const savedSet = new Set((savedRes.data || []).map((s) => s.post_id));

  const enrichedPosts = await signPostMedia(supabase, await attachSharedPosts(supabase, (posts || []).map((p) => ({
    ...p,
    user_reaction: reactionMap[p.id] || null,
    is_saved: savedSet.has(p.id),
  }))));

  // Suggested users — only if there are other users to suggest
  const excludeIds = [user.id, ...friendIds];
  const suggestedQuery = supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio")
    .eq("profile_visibility", "public")
    .neq("id", user.id)
    .limit(5);

  const { data: suggestedUsers } = friendIds.length > 0
    ? await suggestedQuery.not("id", "in", `(${excludeIds.join(",")})`)
    : await suggestedQuery;

  const rightSidebar = suggestedUsers && suggestedUsers.length > 0 ? (
    <div className="space-y-4">
      <h3 className="font-semibold text-[var(--text-primary)]">People you may know</h3>
      {suggestedUsers.map((u) => (
        <div key={u.id} className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.display_name)}&size=80&background=12372A&color=D6B875`}
            alt={u.display_name}
            className="w-10 h-10 rounded-full object-cover"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-[var(--text-primary)]">{u.display_name}</p>
            <p className="text-xs text-[var(--text-secondary)] truncate">@{u.username}</p>
          </div>
          <a
            href={`/profile/${u.username}`}
            className="text-xs text-brand-green-800 dark:text-brand-gold-400 font-medium hover:underline flex-shrink-0"
          >
            View
          </a>
        </div>
      ))}
    </div>
  ) : undefined;

  return (
    <AppLayout rightSidebar={rightSidebar}>
      <FeedClient
        initialPosts={enrichedPosts as any}
        stories={(feedStories as any) || []}
        profile={profile}
        currentUserId={user.id}
        friendIds={friendIds}
      />
    </AppLayout>
  );
}
