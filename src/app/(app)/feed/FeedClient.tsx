"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CreatePost } from "@/components/posts/CreatePost";
import { StoriesTray } from "@/components/stories/StoriesTray";
import { PostCard } from "@/components/posts/PostCard";
import { CommentSection } from "@/components/posts/CommentSection";
import { PostSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/client";
import { signPostMedia } from "@/lib/media";
import { attachSharedPosts } from "@/lib/shared-posts";
import { attachFeedActivity } from "@/lib/feed-activity";
import type { PostWithAuthor, Profile, StoryWithAuthor } from "@/lib/supabase/types";
import { Users, Clapperboard, Newspaper } from "lucide-react";
import { ReelsViewer } from "@/components/reels/ReelsViewer";

interface FeedClientProps {
  initialPosts: PostWithAuthor[];
  stories: StoryWithAuthor[];
  profile: Profile;
  currentUserId: string;
  friendIds: string[];
}

export function FeedClient({ initialPosts, stories, profile, currentUserId, friendIds }: FeedClientProps) {
  const [tab, setTab] = useState<"feed" | "reels">("feed");
  const [posts, setPosts] = useState<PostWithAuthor[]>(initialPosts);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialPosts.length === 20);
  const [activeComments, setActiveComments] = useState<string | null>(null);
  const pageRef = useRef(1);

  const buildFilter = useCallback(() =>
    friendIds.length > 0
      ? `visibility.eq.public,and(visibility.eq.friends,author_id.in.(${[currentUserId, ...friendIds].join(",")})),author_id.eq.${currentUserId}`
      : `visibility.eq.public,author_id.eq.${currentUserId}`,
  [currentUserId, friendIds]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    const supabase = createClient();
    const from = pageRef.current * 20;

    const { data } = await supabase
      .from("posts")
      .select(`*, author:profiles(*), media:post_media(*)`)
      .is("group_id", null)
      .or(buildFilter())
      .order("created_at", { ascending: false })
      .range(from, from + 19);

    setLoading(false);
    if (!data || data.length === 0) { setHasMore(false); return; }

    const postIds = data.map((p) => p.id);
    const [reactionsRes, savedRes] = await Promise.all([
      supabase.from("reactions").select("post_id, type").eq("user_id", currentUserId).in("post_id", postIds),
      supabase.from("saved_posts").select("post_id").eq("user_id", currentUserId).in("post_id", postIds),
    ]);
    const reactionMap = Object.fromEntries((reactionsRes.data || []).map((r) => [r.post_id, r.type]));
    const savedSet = new Set((savedRes.data || []).map((s) => s.post_id));

    const enriched = await attachFeedActivity(supabase, await signPostMedia(supabase, await attachSharedPosts(supabase, data.map((p) => ({
      ...p,
      user_reaction: reactionMap[p.id] || null,
      is_saved: savedSet.has(p.id),
    })))) as unknown as PostWithAuthor[]);

    setPosts((prev) => [...prev, ...enriched]);
    setHasMore(data.length === 20);
    pageRef.current += 1;
  }, [loading, hasMore, currentUserId, buildFilter]);

  useEffect(() => {
    const handler = () => {
      if (tab !== "feed") return;
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400) {
        loadMore();
      }
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [loadMore, tab]);

  const refreshFeed = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("posts")
      .select(`*, author:profiles(*), media:post_media(*)`)
      .is("group_id", null)
      .or(buildFilter())
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) {
      const [reactionsRes, savedRes] = await Promise.all([
        supabase.from("reactions").select("post_id, type").eq("user_id", currentUserId).in("post_id", data.map((p) => p.id)),
        supabase.from("saved_posts").select("post_id").eq("user_id", currentUserId).in("post_id", data.map((p) => p.id)),
      ]);
      const reactionMap = Object.fromEntries((reactionsRes.data || []).map((r) => [r.post_id, r.type]));
      const savedSet = new Set((savedRes.data || []).map((s) => s.post_id));
      const enriched = await attachFeedActivity(supabase, await signPostMedia(supabase, await attachSharedPosts(supabase, data.map((p) => ({
        ...p,
        user_reaction: reactionMap[p.id] || null,
        is_saved: savedSet.has(p.id),
      })))) as unknown as PostWithAuthor[]);
      pageRef.current = 1;
      setPosts(enriched);
      setHasMore(data.length === 20);
    }
  }, [buildFilter, currentUserId]);

  function toggleComments(postId: string) {
    setActiveComments((prev) => (prev === postId ? null : postId));
  }

  return (
    <div className="space-y-4">
      {/* Home tabs */}
      <div className="card p-1 flex gap-1">
        <button onClick={() => setTab("feed")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tab === "feed" ? "bg-[rgb(var(--a-800))] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--border)]"}`}>
          <Newspaper className="w-4 h-4" /> Feed
        </button>
        <button onClick={() => setTab("reels")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tab === "reels" ? "bg-[rgb(var(--a-800))] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--border)]"}`}>
          <Clapperboard className="w-4 h-4" /> Reels
        </button>
      </div>

      {tab === "reels" ? (
        <ReelsViewer />
      ) : (
        <>
      <CreatePost profile={profile} onCreated={refreshFeed} />

      <StoriesTray stories={stories} profile={profile} currentUserId={currentUserId} />

      {posts.length === 0 && !loading && (
        <EmptyState
          icon={<Users className="w-8 h-8" />}
          title="Your feed is empty"
          description="Connect with people or follow accounts to see their posts here."
          action={<a href="/discover" className="btn-primary">Discover people</a>}
        />
      )}

      {posts.map((post) => (
        <div key={post.id}>
          <PostCard
            post={post}
            currentUserId={currentUserId}
            commentsExpanded={activeComments === post.id}
            onComment={toggleComments}
            onRefresh={refreshFeed}
          />
          {activeComments === post.id && (
            <div className="card -mt-2 rounded-t-none border-t-0">
              <CommentSection postId={post.id} currentProfile={profile} />
            </div>
          )}
        </div>
      ))}

      {loading && (
        <div className="space-y-4">
          <PostSkeleton />
          <PostSkeleton />
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <p className="text-center text-sm text-[var(--text-secondary)] py-6">
          You&apos;re all caught up!
        </p>
      )}
        </>
      )}
    </div>
  );
}
