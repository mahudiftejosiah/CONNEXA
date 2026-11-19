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

export function StoriesClient({ stories: initStories, profile, currentUserId, openAuthorId }: StoriesClientProps) {
  const [stories, setStories] = useState(initStories);
  const [viewing, setViewing] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [storyReactions, setStoryReactions] = useState<Record<string, StoryReaction[]>>({});
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<{ viewer_id: string; created_at: string; profile?: Profile }[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const downAtRef = useRef(0);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const grouped = stories.reduce((acc, story) => {
    const id = story.author_id;
    if (!acc[id]) acc[id] = { author: story.author, stories: [] };
    acc[id].stories.push(story);
    return acc;
  }, {} as Record<string, { author: Profile; stories: StoryWithAuthor[] }>);

  const groups = Object.values(grouped);

  const viewingStory = viewing !== null ? stories[viewing] : null;
  const isOwnStory = viewingStory?.author_id === currentUserId;
  const groupStories = viewingStory ? stories.filter((s) => s.author_id === viewingStory.author_id) : [];
  const groupIndexOf = viewingStory ? groupStories.findIndex((s) => s.id === viewingStory.id) : -1;

  function openAt(index: number) {
    setViewing(index);
    setProgress(0);
    setPaused(false);
    setReplyOpen(false);
    setReplyText("");
    void handleView(stories[index].id);
  }

  // Tray tiles open that author's first story they have not seen yet.
  function openAuthor(authorId: string) {
    const unviewed = stories.findIndex((s) => s.author_id === authorId && !s.has_viewed);
    const i = unviewed === -1 ? stories.findIndex((s) => s.author_id === authorId) : unviewed;
    if (i < 0) return;
    openAt(i);
  }

  // /stories?author=<id> (from the feed tray) opens that person's story.
  const autoOpened = useRef<string | null>(null);
  useEffect(() => {
    if (!openAuthorId || autoOpened.current === openAuthorId || stories.length === 0) return;
    const idx = stories.findIndex((s) => s.author_id === openAuthorId);
    if (idx >= 0) { autoOpened.current = openAuthorId; openAt(idx); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAuthorId, stories]);

  async function handleView(storyId: string) {
    const { data: already } = await supabase.from("story_views")
      .select("id").eq("story_id", storyId).eq("viewer_id", currentUserId).maybeSingle();
    if (already) return;
    await supabase.from("story_views").insert({ story_id: storyId, viewer_id: currentUserId });
    setStories((p) => p.map((s) => s.id === storyId ? { ...s, has_viewed: true } : s));
    refreshStoryRings();
  }

  function goNext() {
    if (viewing === null) return;
    const next = viewing + 1;
    setProgress(0);
    if (next < stories.length) { setViewing(next); void handleView(stories[next].id); }
    else setViewing(null);
  }

  function goPrev() {
    if (viewing === null) return;
    const prev = viewing - 1;
    setProgress(0);
    if (prev >= 0) { setViewing(prev); void handleView(stories[prev].id); }
    else setViewing(null);
  }

  // Photo stories run on a 5s timer; videos drive the bar themselves and call
  // goNext when they end.
  useEffect(() => {
    if (viewing === null) return;
    const story = stories[viewing];
    if (!story || story.media_type === "video") return;
    if (paused) return;
    const started = Date.now() - progress * STORY_SECONDS;
    const timer = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / STORY_SECONDS);
      setProgress(p);
      if (p >= 1) { window.clearInterval(timer); goNext(); }
    }, 50);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing, paused, stories.length]);

  useEffect(() => {
    if (viewing === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setViewing(null);
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing, stories]);

  // Reactions of the open author's stories load with the viewer so the chips
  // and the author's counts are there at once.
  useEffect(() => {
    if (!viewingStory) return;
    const ids = stories.filter((s) => s.author_id === viewingStory.author_id).map((s) => s.id);
    if (ids.length === 0) return;
    void (async () => {
      const { data } = await supabase.from("story_reactions").select("*").in("story_id", ids);
      const groupedRx: Record<string, StoryReaction[]> = {};
      (data || []).forEach((r) => {
        groupedRx[r.story_id] = [...(groupedRx[r.story_id] || []), r];
      });
      setStoryReactions(groupedRx);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing]);

  async function toggleStoryReaction(story: StoryWithAuthor, emoji: string) {
    const mine = (storyReactions[story.id] || []).find((r) => r.user_id === currentUserId);
    if (mine && mine.emoji === emoji) {
      setStoryReactions((p) => ({ ...p, [story.id]: (p[story.id] || []).filter((r) => r.user_id !== currentUserId) }));
      const { error } = await supabase.from("story_reactions").delete().eq("id", mine.id);
      if (error) toast.error("Could not remove the reaction.");
      return;
    }
    if (mine) {
      setStoryReactions((p) => ({
        ...p,
        [story.id]: (p[story.id] || []).map((r) => (r.user_id === currentUserId ? { ...r, emoji } : r)),
      }));
      const { error } = await supabase.from("story_reactions").update({ emoji }).eq("id", mine.id);
      if (error) toast.error("Could not change the reaction.");
      return;
    }
    const optimistic: StoryReaction = {
      id: `tmp-${Date.now()}`,
      story_id: story.id,
      user_id: currentUserId,
      emoji,
      created_at: new Date().toISOString(),
    };
    setStoryReactions((p) => ({ ...p, [story.id]: [...(p[story.id] || []), optimistic] }));
    const { data, error } = await supabase
      .from("story_reactions")
      .upsert({ story_id: story.id, user_id: currentUserId, emoji }, { onConflict: "story_id,user_id" })
      .select()
      .single();
    if (error || !data) {
      toast.error("Could not react. Has migration 037 been applied?");
      setStoryReactions((p) => ({ ...p, [story.id]: (p[story.id] || []).filter((r) => r.id !== optimistic.id) }));
      return;
    }
    setStoryReactions((p) => ({
      ...p,
      [story.id]: (p[story.id] || []).map((r) => (r.id === optimistic.id ? data : r)),
    }));
  }

  // Replying to a story opens (or reuses) the DM thread and attaches the story.
  async function sendReply() {
    if (!viewingStory) return;
    const text = replyText.trim();
    if (!text) return;
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantId: viewingStory.author_id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.conversationId) { toast.error("Could not open that chat."); return; }
    const { error } = await supabase.from("messages").insert({
      conversation_id: json.conversationId,
      sender_id: currentUserId,
      content: text.slice(0, 2000),
      story_id: viewingStory.id,
    });
    if (error) { toast.error("Could not reply. Has migration 037 been applied?"); return; }
    setReplyOpen(false);
    setReplyText("");
    toast.success(`Reply sent to ${viewingStory.author.display_name}.`);
  }

  // Authors see exactly who watched, newest first.
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
    const ids = (links || []).map((l) => l.viewer_id);
    if (ids.length === 0) { setViewers([]); setViewersLoading(false); return; }
    const { data: profiles } = await supabase.from("profiles").select("*").in("id", ids);
    const byId = new Map((profiles || []).map((p) => [p.id, p]));
    setViewers((links || []).map((l) => ({ ...l, profile: byId.get(l.viewer_id) })));
    setViewersLoading(false);
  }

  async function handleDelete(storyId: string) {
    const target = stories.find((s) => s.id === storyId);
    setViewing(null);
    // The stored file has no reason to outlive its row.
    if (target?.media_url && !target.media_url.startsWith("http")) {
      try { await supabase.storage.from("stories").remove([target.media_url]); } catch { /* already gone */ }
    }
    await supabase.from("stories").delete().eq("id", storyId).eq("author_id", currentUserId);
    setStories((p) => p.filter((s) => s.id !== storyId));
    refreshStoryRings();
    toast.success("Story deleted.");
  }

  // Stories posted while the page is open arrive on their own: realtime first,
  // a slow poll for the connections that never open.
  const refetchStories = useCallback(async () => {
    const { data: friendships } = await supabase.from("friendships").select("friend_id").eq("user_id", currentUserId);
    const ids = [currentUserId, ...(friendships || []).map((f) => f.friend_id)].slice(0, 100);
    const { data: fresh } = await supabase
      .from("stories")
      .select("*, author:profiles(*)")
      .in("author_id", ids)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(40);
    if (!fresh) return;
    const storyIds = fresh.map((s) => s.id);
    const { data: views } = storyIds.length
      ? await supabase.from("story_views").select("story_id").eq("viewer_id", currentUserId).in("story_id", storyIds)
      : { data: [] };
    const viewedSet = new Set((views || []).map((v) => v.story_id));
    const signed = await signStoryMedia(
      supabase,
      fresh.map((s) => ({ ...s, has_viewed: viewedSet.has(s.id) }))
    );
    setStories(signed as unknown as StoryWithAuthor[]);
  }, [currentUserId, supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("stories-page")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stories" }, () => { void refetchStories(); })
      .subscribe();
    const poll = window.setInterval(() => void refetchStories(), 30_000);
    return () => { supabase.removeChannel(channel); window.clearInterval(poll); };
  }, [refetchStories, supabase]);

  // Short tap navigates, holding pauses — the layer sits under the header and
  // the reply bar, so buttons never turn into navigation.
  function onLayerDown() {
    downAtRef.current = Date.now();
    setPaused(true);
    videoRef.current?.pause();
  }

  function resumeMedia() {
    setPaused(false);
    if (videoRef.current) void videoRef.current.play().catch(() => { /* autoplay rules */ });
  }

  function onLayerUp(e: React.PointerEvent<HTMLDivElement>) {
    const held = Date.now() - downAtRef.current;
    resumeMedia();
    if (held < 250) {
      const rect = e.currentTarget.getBoundingClientRect();
      if (e.clientX - rect.left < rect.width * 0.3) goPrev(); else goNext();
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>Stories</h1>

      {/* The same tray the feed shows, so the two pages are one design */}
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
          action={<Button onClick={() => setCreating(true)}>Create story</Button>}
        />
      )}

      {/* Story viewer */}
      {viewingStory && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none" role="dialog" aria-label="Story viewer">
          {/* Progress segments: one per story of the open author */}
          <div className="absolute top-2 left-2 right-2 flex gap-1 z-30">
            {groupStories.map((s, gi) => (
              <div key={s.id} className="h-0.5 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.25)" }}>
                {gi < groupIndexOf ? (
                  <div className="h-full w-full" style={{ backgroundColor: "rgba(255,255,255,0.9)" }} />
                ) : gi === groupIndexOf ? (
                  <div className="h-full" style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: "rgba(255,255,255,0.9)", transition: "width 60ms linear" }} />
                ) : null}
              </div>
            ))}
          </div>

          {/* Author info */}
          <div className="absolute top-4 left-3 right-3 z-30 flex items-center gap-3">
            <Link href={`/profile/${viewingStory.author.username}`} onClick={() => setViewing(null)}>
              <Avatar src={viewingStory.author.avatar_url} name={viewingStory.author.display_name} size={36} userId={viewingStory.author.id} />
            </Link>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">
                {viewingStory.author.display_name}<AccountBadge account={viewingStory.author} />
              </p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                {formatRelativeTime(viewingStory.created_at)}
                {viewingStory.audience === "friends" ? " · friends only" : ""}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              {isOwnStory && (
                <>
                  <button onClick={() => void openViewers()} className="flex items-center gap-1 text-xs text-white/80 hover:text-white" aria-label="See who watched">
                    <Eye className="w-4 h-4" /> {viewingStory.view_count}
                  </button>
                  <button onClick={() => void handleDelete(viewingStory.id)} className="text-red-400 hover:text-red-300" aria-label="Delete story">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
              <button onClick={() => setViewing(null)} className="text-white p-1" aria-label="Close">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Tap layer */}
          <div
            className="absolute inset-0 z-10"
            onPointerDown={onLayerDown}
            onPointerUp={onLayerUp}
            onPointerLeave={resumeMedia}
          />

          {/* Media */}
          <div className="relative z-0 max-w-sm w-full mx-auto">
            {viewingStory.media_type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={viewingStory.id} src={viewingStory.media_url} alt={viewingStory.caption || "Story"} className="w-full max-h-[80vh] object-contain" />
            ) : (
              <video
                key={viewingStory.id}
                ref={videoRef}
                src={viewingStory.media_url}
                autoPlay
                playsInline
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (v.duration > 0) setProgress(Math.min(1, v.currentTime / v.duration));
                }}
                onEnded={goNext}
                className="w-full max-h-[80vh] object-contain"
              />
            )}

            {viewingStory.caption && (
              <div className="absolute bottom-20 left-4 right-4 text-center pointer-events-none">
                <p className="text-white text-sm rounded-xl px-3 py-2" style={{ background: "rgba(0,0,0,0.4)" }}>
                  {viewingStory.caption}
                </p>
              </div>
            )}
          </div>

          {/* Footer: the author sees reaction chips, everyone else reacts and replies */}
          <div className="absolute bottom-3 left-3 right-3 z-30">
            {isOwnStory ? (
              (() => {
                const rx = storyReactions[viewingStory.id] || [];
                if (rx.length === 0) {
                  return <p className="text-xs text-white/60 px-1">No reactions yet.</p>;
                }
                const chipGroups: { emoji: string; count: number }[] = [];
                rx.forEach((r) => {
                  const g = chipGroups.find((c) => c.emoji === r.emoji);
                  if (g) g.count += 1;
                  else chipGroups.push({ emoji: r.emoji, count: 1 });
                });
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {chipGroups.map((c) => (
                      <span key={c.emoji} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-white" style={{ background: "rgba(255,255,255,0.15)" }}>
                        {c.emoji} {c.count}
                      </span>
                    ))}
                  </div>
                );
              })()
            ) : replyOpen ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(); }
                  }}
                  placeholder={`Reply to ${viewingStory.author.display_name}…`}
                  maxLength={2000}
                  className="input flex-1 text-sm bg-black/40 border-white/20 text-white placeholder-white/50"
                />
                <button onClick={() => void sendReply()} className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white" aria-label="Send reply">
                  <Send className="w-4 h-4" />
                </button>
                <button onClick={() => { setReplyOpen(false); setReplyText(""); }} className="p-2 rounded-xl text-white/70 hover:text-white" aria-label="Cancel reply">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setReplyOpen(true)}
                  className="flex-1 min-w-0 px-3 py-2 rounded-full text-sm text-white text-left truncate"
                  style={{ background: "rgba(255,255,255,0.15)" }}
                >
                  Reply to {viewingStory.author.display_name.split(" ")[0]}…
                </button>
                {REACTION_EMOJIS.map((e) => (
                  <button key={e} onClick={() => void toggleStoryReaction(viewingStory, e)}
                    className="p-1.5 text-xl leading-none transition-transform hover:scale-125 flex-shrink-0"
                    aria-label={`React with ${e}`}>
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Who watched — authors only, the database enforces it */}
      <Modal open={viewersOpen} onClose={() => setViewersOpen(false)} title="Who watched" size="sm">
        {viewersLoading ? (
          <p className="py-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>Loading…</p>
        ) : viewers.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No views yet.</p>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto divide-y" style={{ borderColor: "var(--border)" }}>
            {viewers.map((v) => (
              <div key={`${v.viewer_id}-${v.created_at}`} className="flex items-center gap-3 py-2.5">
                <Avatar src={v.profile?.avatar_url} name={v.profile?.display_name || "User"} size={40} userId={v.viewer_id} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                    {v.profile?.display_name || "User"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{formatRelativeTime(v.created_at)}</p>
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
        onPublished={(story) => setStories((p) => [story, ...p])}
      />
    </div>
  );
}
