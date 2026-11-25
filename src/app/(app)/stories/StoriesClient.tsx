"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Eye, Trash2, Upload, Send } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { AccountBadge } from "@/components/ui/ProBadge";
import { StoriesTray } from "@/components/stories/StoriesTray";
import { CreateStory } from "@/components/stories/CreateStory";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { refreshStoryRings } from "@/components/layout/StoryRingProvider";
import { signStoryMedia } from "@/lib/media";
import { storyAuthorIds } from "@/lib/story-audience";
import type { StoryWithAuthor, Profile, StoryReaction } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";

interface StoriesClientProps {
  stories: StoryWithAuthor[];
  profile: Profile;
  currentUserId: string;
  openAuthorId?: string | null;
}

const STORY_SECONDS = 5000;
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

export function StoriesClient({
  stories: initStories,
  profile,
  currentUserId,
  openAuthorId,
}: StoriesClientProps) {
  const [stories, setStories] = useState(initStories);
  const [viewing, setViewing] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const [storyReactions, setStoryReactions] = useState<
    Record<string, StoryReaction[]>
  >({});

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<
    { viewer_id: string; created_at: string; profile?: Profile }[]
  >([]);
  const [viewersLoading, setViewersLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const downAtRef = useRef(0);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const grouped = stories.reduce((acc, story) => {
    const id = story.author_id;

    if (!acc[id]) {
      acc[id] = { author: story.author, stories: [] };
    }

    acc[id].stories.push(story);
    return acc;
  }, {} as Record<string, { author: Profile; stories: StoryWithAuthor[] }>);

  const groups = Object.values(grouped);

  const viewingStory = viewing !== null ? stories[viewing] : null;
  const isOwnStory = viewingStory?.author_id === currentUserId;

  const groupStories = viewingStory
    ? stories.filter((s) => s.author_id === viewingStory.author_id)
    : [];

  const groupIndexOf = viewingStory
    ? groupStories.findIndex((s) => s.id === viewingStory.id)
    : -1;

  function pauseStory() {
    setPaused(true);
    videoRef.current?.pause();
  }

  function resumeStory() {
    setPaused(false);

    if (videoRef.current) {
      void videoRef.current.play().catch(() => {});
    }
  }

  function openAt(index: number) {
    setViewing(index);
    setProgress(0);
    setPaused(false);
    setReplyOpen(false);
    setReplyText("");

    void handleView(stories[index].id);
  }

  function openAuthor(authorId: string) {
    const unviewed = stories.findIndex(
      (s) => s.author_id === authorId && !s.has_viewed
    );

    const index =
      unviewed === -1
        ? stories.findIndex((s) => s.author_id === authorId)
        : unviewed;

    if (index < 0) return;

    openAt(index);
  }

  const autoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (!openAuthorId || autoOpened.current === openAuthorId || stories.length === 0) {
      return;
    }

    const index = stories.findIndex(
      (s) => s.author_id === openAuthorId
    );

    if (index >= 0) {
      autoOpened.current = openAuthorId;
      openAt(index);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAuthorId, stories]);

  async function handleView(storyId: string) {
    const { data: already } = await supabase
      .from("story_views")
      .select("id")
      .eq("story_id", storyId)
      .eq("viewer_id", currentUserId)
      .maybeSingle();

    if (already) return;

    const { error } = await supabase.from("story_views").insert({
      story_id: storyId,
      viewer_id: currentUserId,
    });

    if (error) return;

    setStories((previous) =>
      previous.map((s) =>
        s.id === storyId ? { ...s, has_viewed: true } : s
      )
    );

    refreshStoryRings();
  }

  function goNext() {
    if (viewing === null) return;

    const currentStory = stories[viewing];

    if (!currentStory) {
      setViewing(null);
      return;
    }

    const sameAuthor = stories
      .map((story, index) => ({ story, index }))
      .filter(({ story }) => story.author_id === currentStory.author_id);

    const currentPosition = sameAuthor.findIndex(
      ({ story }) => story.id === currentStory.id
    );

    if (currentPosition < sameAuthor.length - 1) {
      const nextIndex = sameAuthor[currentPosition + 1].index;

      setProgress(0);
      setViewing(nextIndex);
      setPaused(false);
      setReplyOpen(false);
      setReplyText("");

      void handleView(stories[nextIndex].id);
      return;
    }

    const nextAuthorStory = stories.findIndex(
      (story, index) =>
        index > viewing &&
        story.author_id !== currentStory.author_id
    );

    setProgress(0);

    if (nextAuthorStory !== -1) {
      setViewing(nextAuthorStory);
      setPaused(false);
      setReplyOpen(false);
      setReplyText("");

      void handleView(stories[nextAuthorStory].id);
    } else {
      setViewing(null);
      setReplyOpen(false);
    }
  }

  function goPrev() {
    if (viewing === null) return;

    const currentStory = stories[viewing];

    if (!currentStory) return;

    const sameAuthor = stories
      .map((story, index) => ({ story, index }))
      .filter(({ story }) => story.author_id === currentStory.author_id);

    const currentPosition = sameAuthor.findIndex(
      ({ story }) => story.id === currentStory.id
    );

    if (currentPosition > 0) {
      const previousIndex = sameAuthor[currentPosition - 1].index;

      setProgress(0);
      setViewing(previousIndex);
      setPaused(false);
      setReplyOpen(false);
      setReplyText("");

      void handleView(stories[previousIndex].id);
      return;
    }

    if (viewing > 0) {
      const previousIndex = viewing - 1;

      setProgress(0);
      setViewing(previousIndex);
      setPaused(false);
      setReplyOpen(false);
      setReplyText("");

      void handleView(stories[previousIndex].id);
    } else {
      setViewing(null);
    }
  }

  // Pause the photo timer while replying or viewing a paused story.
  useEffect(() => {
    if (viewing === null || paused || replyOpen) return;

    const story = stories[viewing];

    if (!story || story.media_type === "video") return;

    const started = Date.now() - progress * STORY_SECONDS;

    const timer = window.setInterval(() => {
      const nextProgress = Math.min(
        1,
        (Date.now() - started) / STORY_SECONDS
      );

      setProgress(nextProgress);

      if (nextProgress >= 1) {
        window.clearInterval(timer);
        goNext();
      }
    }, 50);

    return () => window.clearInterval(timer);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing, paused, replyOpen, stories.length]);

  useEffect(() => {
    if (viewing === null) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setViewing(null);
        setReplyOpen(false);
      }

      if (event.key === "ArrowLeft" && !replyOpen) {
        goPrev();
      }

      if (event.key === "ArrowRight" && !replyOpen) {
        goNext();
      }
    }

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing, stories, replyOpen]);

  // Load reactions for the currently opened author's stories.
  useEffect(() => {
    if (!viewingStory) return;

    const ids = stories
      .filter((s) => s.author_id === viewingStory.author_id)
      .map((s) => s.id);

    if (ids.length === 0) return;

    let active = true;

    async function loadReactions() {
      const { data, error } = await supabase
        .from("story_reactions")
        .select("*")
        .in("story_id", ids);

      if (error || !active) return;

      const groupedReactions: Record<string, StoryReaction[]> = {};

      (data || []).forEach((reaction) => {
        groupedReactions[reaction.story_id] = [
          ...(groupedReactions[reaction.story_id] || []),
          reaction,
        ];
      });

      setStoryReactions((previous) => ({
        ...previous,
        ...groupedReactions,
      }));
    }

    void loadReactions();

    return () => {
      active = false;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing]);

  async function toggleStoryReaction(
    story: StoryWithAuthor,
    emoji: string
  ) {
    const existing = storyReactions[story.id] || [];

    const mine = existing.find(
      (reaction) => reaction.user_id === currentUserId
    );

    // Remove an existing reaction.
    if (mine && mine.emoji === emoji) {
      setStoryReactions((previous) => ({
        ...previous,
        [story.id]: (previous[story.id] || []).filter(
          (reaction) => reaction.user_id !== currentUserId
        ),
      }));

      const { error } = await supabase
        .from("story_reactions")
        .delete()
        .eq("id", mine.id)
        .eq("user_id", currentUserId);

      if (error) {
        setStoryReactions((previous) => ({
          ...previous,
          [story.id]: [...(previous[story.id] || []), mine],
        }));

        toast.error("Could not remove reaction.");
      }

      return;
    }

    // Change an existing reaction.
    if (mine) {
      setStoryReactions((previous) => ({
        ...previous,
        [story.id]: (previous[story.id] || []).map((reaction) =>
          reaction.user_id === currentUserId
            ? { ...reaction, emoji }
            : reaction
        ),
      }));

      const { error } = await supabase
        .from("story_reactions")
        .update({ emoji })
        .eq("id", mine.id)
        .eq("user_id", currentUserId);

      if (error) {
        setStoryReactions((previous) => ({
          ...previous,
          [story.id]: (previous[story.id] || []).map((reaction) =>
            reaction.user_id === currentUserId ? mine : reaction
          ),
        }));

        toast.error("Could not change reaction.");
      }

      return;
    }

    // Create a new reaction.
    const optimistic: StoryReaction = {
      id: `tmp-${Date.now()}`,
      story_id: story.id,
      user_id: currentUserId,
      emoji,
      created_at: new Date().toISOString(),
    };

    setStoryReactions((previous) => ({
      ...previous,
      [story.id]: [...(previous[story.id] || []), optimistic],
    }));

    const { data, error } = await supabase
      .from("story_reactions")
      .upsert(
        {
          story_id: story.id,
          user_id: currentUserId,
          emoji,
        },
        {
          onConflict: "story_id,user_id",
        }
      )
      .select()
      .single();

    if (error || !data) {
      setStoryReactions((previous) => ({
        ...previous,
        [story.id]: (previous[story.id] || []).filter(
          (reaction) => reaction.id !== optimistic.id
        ),
      }));

      toast.error("Could not react to this story. Please try again.");
      return;
    }

    setStoryReactions((previous) => ({
      ...previous,
      [story.id]: (previous[story.id] || []).map((reaction) =>
        reaction.id === optimistic.id ? data : reaction
      ),
    }));
  }

  async function sendReply() {
    if (!viewingStory || sendingReply) return;

    const text = replyText.trim();

    if (!text) {
      toast.error("Please enter a reply.");
      return;
    }

    setSendingReply(true);

    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          participantId: viewingStory.author_id,
        }),
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json.conversationId) {
        toast.error("Could not open that chat.");
        return;
      }

      const { error } = await supabase.from("messages").insert({
        conversation_id: json.conversationId,
        sender_id: currentUserId,
        content: text.slice(0, 2000),
        story_id: viewingStory.id,
      });

      if (error) {
        toast.error("Could not send your reply.");
        return;
      }

      setReplyOpen(false);
      setReplyText("");
      resumeStory();

      toast.success(`Reply sent to ${viewingStory.author.display_name}.`);
    } catch {
      toast.error("Something went wrong while sending your reply.");
    } finally {
      setSendingReply(false);
    }
  }

  async function openViewers() {
    if (!viewingStory) return;

    setViewersOpen(true);
    setViewersLoading(true);

    const { data: links } = await supabase
      .from("story_views")
      .select("viewer_id, created_at")
      .eq("story_id", viewingStory.id)
      .order("created_at", { ascending: false })
      .limit(200);

    const ids = (links || []).map((link) => link.viewer_id);

    if (ids.length === 0) {
      setViewers([]);
      setViewersLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", ids);

    const byId = new Map(
      (profiles || []).map((item) => [item.id, item])
    );

    setViewers(
      (links || []).map((link) => ({
        ...link,
        profile: byId.get(link.viewer_id),
      }))
    );

    setViewersLoading(false);
  }

  async function handleDelete(storyId: string) {
    const target = stories.find((story) => story.id === storyId);

    setViewing(null);

    if (target?.media_url && !target.media_url.startsWith("http")) {
      try {
        await supabase.storage.from("stories").remove([
          target.media_url,
        ]);
      } catch {
        // The stored file may already be gone.
      }
    }

    const { error } = await supabase
      .from("stories")
      .delete()
      .eq("id", storyId)
      .eq("author_id", currentUserId);

    if (error) {
      toast.error("Could not delete story.");
      return;
    }

    setStories((previous) =>
      previous.filter((story) => story.id !== storyId)
    );

    refreshStoryRings();
    toast.success("Story deleted.");
  }

  const refetchStories = useCallback(async () => {
    const ids = await storyAuthorIds(supabase, currentUserId);

    const { data: fresh } = await supabase
      .from("stories")
      .select("*, author:profiles(*)")
      .in("author_id", ids)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(40);

    if (!fresh) return;

    const storyIds = fresh.map((story) => story.id);

    const { data: views } = storyIds.length
      ? await supabase
          .from("story_views")
          .select("story_id")
          .eq("viewer_id", currentUserId)
          .in("story_id", storyIds)
      : { data: [] };

    const viewedSet = new Set(
      (views || []).map((view) => view.story_id)
    );

    const signed = await signStoryMedia(
      supabase,
      fresh.map((story) => ({
        ...story,
        has_viewed: viewedSet.has(story.id),
      }))
    );

    setStories(signed as unknown as StoryWithAuthor[]);
  }, [currentUserId, supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("stories-page")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stories",
        },
        () => {
          void refetchStories();
        }
      )
      .subscribe();

    const poll = window.setInterval(
      () => void refetchStories(),
      30_000
    );

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(poll);
    };
  }, [refetchStories, supabase]);

  function onLayerDown(event: React.PointerEvent<HTMLDivElement>) {
    downAtRef.current = Date.now();
    pauseStory();
  }

  function onLayerUp(event: React.PointerEvent<HTMLDivElement>) {
    const held = Date.now() - downAtRef.current;

    if (replyOpen) return;

    resumeStory();

    if (held < 250) {
      const rect = event.currentTarget.getBoundingClientRect();

      if (event.clientX - rect.left < rect.width * 0.3) {
        goPrev();
      } else {
        goNext();
      }
    }
  }

  function closeReply() {
    setReplyOpen(false);
    setReplyText("");
    resumeStory();
  }

  return (
    <div className="space-y-4">
      <h1
        className="text-2xl font-extrabold"
        style={{ color: "var(--text-primary)" }}
      >
        Stories
      </h1>

      <StoriesTray
        stories={stories}
        profile={profile}
        currentUserId={currentUserId}
        onCreate={() => setCreating(true)}
        onOpen={openAuthor}
      />

      {groups.length === 0 && (
        <EmptyState
          icon={<Upload className="w-8 h-8" />}
          title="No active stories"
          description="Stories disappear after 24 hours."
          action={
            <Button onClick={() => setCreating(true)}>
              Create story
            </Button>
          }
        />
      )}

      {viewingStory && (
        <div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none"
          role="dialog"
          aria-label="Story viewer"
        >
          {/* Story progress */}
          <div className="absolute top-2 left-2 right-2 flex gap-1 z-30">
            {groupStories.map((story, index) => (
              <div
                key={story.id}
                className="h-0.5 flex-1 rounded-full overflow-hidden"
                style={{
                  backgroundColor: "rgba(255,255,255,0.25)",
                }}
              >
                {index < groupIndexOf ? (
                  <div
                    className="h-full w-full"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.9)",
                    }}
                  />
                ) : index === groupIndexOf ? (
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.round(progress * 100)}%`,
                      backgroundColor: "rgba(255,255,255,0.9)",
                      transition: "width 60ms linear",
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>

          {/* Author information */}
          <div className="absolute top-4 left-3 right-3 z-30 flex items-center gap-3">
            <Link
              href={`/profile/${viewingStory.author.username}`}
              onClick={() => setViewing(null)}
            >
              <Avatar
                src={viewingStory.author.avatar_url}
                name={viewingStory.author.display_name}
                size={36}
                userId={viewingStory.author.id}
              />
            </Link>

            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">
                {viewingStory.author.display_name}
                <AccountBadge account={viewingStory.author} />
              </p>

              <p
                className="text-xs"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                {formatRelativeTime(viewingStory.created_at)}
                {viewingStory.audience === "friends"
                  ? " · friends only"
                  : ""}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              {isOwnStory && (
                <>
                  <button
                    type="button"
                    onClick={() => void openViewers()}
                    className="flex items-center gap-1 text-xs text-white/80 hover:text-white"
                    aria-label="See who watched"
                  >
                    <Eye className="w-4 h-4" />
                    {viewingStory.view_count}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDelete(viewingStory.id)}
                    className="text-red-400 hover:text-red-300"
                    aria-label="Delete story"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setViewing(null);
                  setReplyOpen(false);
                }}
                className="text-white p-1"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Navigation layer */}
          <div
            className="absolute inset-0 z-10"
            onPointerDown={onLayerDown}
            onPointerUp={onLayerUp}
            onPointerCancel={resumeStory}
            onPointerLeave={() => {
              if (!replyOpen) resumeStory();
            }}
          />

          {/* Story media */}
          <div className="relative z-0 max-w-sm w-full mx-auto pointer-events-none">
            {viewingStory.media_type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={viewingStory.id}
                src={viewingStory.media_url}
                alt={viewingStory.caption || "Story"}
                className="w-full max-h-[80vh] object-contain"
              />
            ) : (
              <video
                key={viewingStory.id}
                ref={videoRef}
                src={viewingStory.media_url}
                autoPlay
                playsInline
                onTimeUpdate={(event) => {
                  const video = event.currentTarget;

                  if (video.duration > 0) {
                    setProgress(
                      Math.min(1, video.currentTime / video.duration)
                    );
                  }
                }}
                onEnded={goNext}
                className="w-full max-h-[80vh] object-contain"
              />
            )}

            {viewingStory.caption && (
              <div className="absolute bottom-20 left-4 right-4 text-center">
                <p
                  className="text-white text-sm rounded-xl px-3 py-2"
                  style={{ background: "rgba(0,0,0,0.4)" }}
                >
                  {viewingStory.caption}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="absolute bottom-3 left-3 right-3 z-40"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            {isOwnStory ? (
              (() => {
                const reactions =
                  storyReactions[viewingStory.id] || [];

                if (reactions.length === 0) {
                  return (
                    <p className="text-xs text-white/60 px-1">
                      No reactions yet.
                    </p>
                  );
                }

                const chipGroups: {
                  emoji: string;
                  count: number;
                }[] = [];

                reactions.forEach((reaction) => {
                  const group = chipGroups.find(
                    (item) => item.emoji === reaction.emoji
                  );

                  if (group) {
                    group.count += 1;
                  } else {
                    chipGroups.push({
                      emoji: reaction.emoji,
                      count: 1,
                    });
                  }
                });

                return (
                  <div className="flex flex-wrap gap-1.5">
                    {chipGroups.map((item) => (
                      <span
                        key={item.emoji}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-white"
                        style={{
                          background: "rgba(255,255,255,0.15)",
                        }}
                      >
                        {item.emoji} {item.count}
                      </span>
                    ))}
                  </div>
                );
              })()
            ) : replyOpen ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendReply();
                }}
              >
                <input
                  autoFocus
                  value={replyText}
                  onChange={(event) =>
                    setReplyText(event.target.value)
                  }
                  placeholder={`Reply to ${viewingStory.author.display_name}…`}
                  maxLength={2000}
                  className="input flex-1 text-sm bg-black/70 border-white/20 text-white placeholder-white/50"
                />

                <button
                  type="submit"
                  disabled={sendingReply || !replyText.trim()}
                  className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white disabled:opacity-50"
                  aria-label="Send reply"
                >
                  <Send className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={closeReply}
                  className="p-2 rounded-xl text-white/70 hover:text-white"
                  aria-label="Cancel reply"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    pauseStory();
                    setReplyOpen(true);
                  }}
                  className="flex-1 min-w-0 px-3 py-2 rounded-full text-sm text-white text-left truncate"
                  style={{
                    background: "rgba(255,255,255,0.15)",
                  }}
                >
                  Reply to{" "}
                  {viewingStory.author.display_name.split(" ")[0]}…
                </button>

                {REACTION_EMOJIS.map((emoji) => {
                  const selected = (
                    storyReactions[viewingStory.id] || []
                  ).some(
                    (reaction) =>
                      reaction.user_id === currentUserId &&
                      reaction.emoji === emoji
                  );

                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() =>
                        void toggleStoryReaction(viewingStory, emoji)
                      }
                      className={`p-1.5 text-xl leading-none transition-transform hover:scale-125 flex-shrink-0 ${
                        selected
                          ? "scale-125 rounded-full bg-white/20"
                          : ""
                      }`}
                      aria-label={`React with ${emoji}`}
                      aria-pressed={selected}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Story viewers */}
      <Modal
        open={viewersOpen}
        onClose={() => setViewersOpen(false)}
        title="Who watched"
        size="sm"
      >
        {viewersLoading ? (
          <p
            className="py-6 text-center text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Loading…
          </p>
        ) : viewers.length === 0 ? (
          <p
            className="py-6 text-center text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            No views yet.
          </p>
        ) : (
          <div
            className="max-h-[50vh] overflow-y-auto divide-y"
            style={{ borderColor: "var(--border)" }}
          >
            {viewers.map((viewer) => (
              <div
                key={`${viewer.viewer_id}-${viewer.created_at}`}
                className="flex items-center gap-3 py-2.5"
              >
                <Avatar
                  src={viewer.profile?.avatar_url}
                  name={viewer.profile?.display_name || "User"}
                  size={40}
                  userId={viewer.viewer_id}
                />

                <div className="flex-1 min-w-0">
                  <p
                    className="font-semibold text-sm truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {viewer.profile?.display_name || "User"}
                  </p>

                  <p
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {formatRelativeTime(viewer.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <CreateStory
        open={creating}
        onClose={() => setCreating(false)}
        currentUserId={currentUserId}
        onPublished={(story) =>
          setStories((previous) => [story, ...previous])
        }
      />
    </div>
  );
}