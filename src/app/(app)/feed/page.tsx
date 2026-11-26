import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signPostMedia, signStoryMedia } from "@/lib/media";
import { attachSharedPosts } from "@/lib/shared-posts";
import { attachFeedActivity } from "@/lib/feed-activity";
import { getLiveSlides } from "@/lib/slides";
import { AppLayout } from "@/components/layout/AppLayout";
import { FeedClient } from "./FeedClient";
import { REEL_POOL, shuffleTake } from "@/lib/reel-pool";
import type { PostWithAuthor } from "@/lib/supabase/types";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Home Feed" };

export default async function FeedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Parallelise profile + friendships + slides — no dependency between them
  const [profileRes, friendshipsRes, slides] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("friendships").select("friend_id").eq("user_id", user.id),
    getLiveSlides(supabase),
  ]);

  const profile = profileRes.data;
  if (!profile) redirect("/login");

  const friendIds = (friendshipsRes.data || []).map((f) => f.friend_id);
  const manyFriends = friendIds.length > 100;
  const cappedFriendIds = friendIds.slice(0, 100);

  // Build story author IDs directly (avoid extra await by inlining the query)
  const [followingRes] = await Promise.all([
    supabase.from("followers").select("following_id").eq("follower_id", user.id),
  ]);
  const storyAuthorSet = new Set<string>([user.id]);
  for (const f of friendIds) storyAuthorSet.add(f);
  for (const row of followingRes.data || []) storyAuthorSet.add(row.following_id);
  const trayIds = Array.from(storyAuthorSet).slice(0, 100);

  const feedFilter = manyFriends
    ? `visibility.eq.public,visibility.eq.friends,author_id.eq.${user.id}`
    : friendIds.length > 0
      ? `visibility.eq.public,and(visibility.eq.friends,author_id.in.(${[user.id, ...friendIds].join(",")})),author_id.eq.${user.id}`
      : `visibility.eq.public,author_id.eq.${user.id}`;

  // Now fire stories + posts + suggested users all at the same time
  const suggestedQuery = supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio")
    .eq("profile_visibility", "public")
    .neq("id", user.id);

  const [storiesRes, postsRes, suggestedRes] = await Promise.all([
    supabase
      .from("stories")
      .select("*, author:profiles(*)")
      .in("author_id", trayIds)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("posts")
      .select("*, author:profiles(*), media:post_media(*)")
      .is("group_id", null)
      .or(feedFilter)
      .order("created_at", { ascending: false })
      .limit(20),
    manyFriends
      ? suggestedQuery.limit(60)
      : friendIds.length > 0
        ? suggestedQuery.not("id", "in", `(${[user.id, ...friendIds].join(",")})`).limit(5)
        : suggestedQuery.limit(5),
  ]);

  const stories = storiesRes.data || [];
  const posts = postsRes.data || [];
  const storyIds = stories.map((s) => s.id);
  const postIds = posts.map((p) => p.id);

  // Fire story views + post reactions/saves at the same time
  const [storyViewsRes, reactionsRes, savedRes] = await Promise.all([
    storyIds.length
      ? supabase.from("story_views").select("story_id").eq("viewer_id", user.id).in("story_id", storyIds)
      : Promise.resolve({ data: [] }),
    postIds.length
      ? supabase.from("reactions").select("post_id, type").eq("user_id", user.id).in("post_id", postIds)
      : Promise.resolve({ data: [] }),
    postIds.length
      ? supabase.from("saved_posts").select("post_id").eq("user_id", user.id).in("post_id", postIds)
      : Promise.resolve({ data: [] }),
  ]);

  const storyViewedSet = new Set((storyViewsRes.data || []).map((v: any) => v.story_id));
  const reactionMap = Object.fromEntries(
    (reactionsRes.data || []).map((r: any) => [r.post_id, r.type])
  );
  const savedSet = new Set((savedRes.data || []).map((s: any) => s.post_id));

  // Sign story media + enrich posts in parallel
  const basePosts = posts.map((p) => ({
    ...p,
    user_reaction: reactionMap[p.id] || null,
    is_saved: savedSet.has(p.id),
  }));

  const [feedStories, enrichedPosts] = await Promise.all([
    signStoryMedia(
      supabase,
      stories.map((s) => ({ ...s, has_viewed: storyViewedSet.has(s.id) }))
    ),
    attachFeedActivity(
      supabase,
      await signPostMedia(
        supabase,
        await attachSharedPosts(supabase, basePosts)
      ) as unknown as PostWithAuthor[]
    ),
  ]);

  const friendSet = new Set(friendIds);
  const suggestedUsers = manyFriends
    ? (suggestedRes.data || []).filter((u: any) => !friendSet.has(u.id)).slice(0, 5)
    : suggestedRes.data;

  const rightSidebar =
    suggestedUsers && suggestedUsers.length > 0 ? (
      <div className="space-y-4">
        <h3 className="font-semibold text-[var(--text-primary)]">People you may know</h3>
        {suggestedUsers.map((u: any) => (
          <div key={u.id} className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                u.avatar_url ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(u.display_name)}&size=80&background=12372A&color=D6B875`
              }
              alt={u.display_name}
              className="w-10 h-10 rounded-full object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-[var(--text-primary)]">
                {u.display_name}
              </p>
              <p className="text-xs text-[var(--text-secondary)] truncate">
                @{u.username}
              </p>
            </div>
            <a
              href={`/profile/${u.username}`}
              className="text-xs font-medium hover:underline flex-shrink-0"
              style={{ color: "rgb(var(--a-800))" }}
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
        slides={slides}
        profile={profile}
        currentUserId={user.id}
        friendIds={cappedFriendIds}
        manyFriends={manyFriends}
        reelSpotlights={shuffleTake(REEL_POOL, 8)}
      />
    </AppLayout>
  );
}
