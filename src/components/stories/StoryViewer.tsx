"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X, Eye, Trash2, Send, Loader2, AlertTriangle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { AccountBadge } from "@/components/ui/ProBadge";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { groupStories, playbackSequence, markStoryViewed } from "@/lib/stories";
import { refreshStoryRings } from "@/components/layout/StoryRingProvider";
import type { StoryWithAuthor, Profile, StoryReaction } from "@/lib/supabase/types";
import { formatRelativeTime } from "@/lib/utils";
import toast from "react-hot-toast";

const STORY_SECONDS = 5000;
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

interface StoryViewerProps {
  stories: StoryWithAuthor[];
  currentUserId: string;
  /** The author whose story opens straight away. */
  startAuthorId?: string | null;
  onClose: () => void;
  /** Fired when a story has been watched, so the tray can take the ring off. */
  onViewed?: (storyId: string) => void;
  /** Fired when the author deletes one of their own stories. */
  onDelete?: (storyId: string) => void;
}

function overlayText(story: StoryWithAuthor) {
  const position = story.overlay_position ?? "bottom";
  const color = story.overlay_color ?? "#FFFFFF";
  const size = story.overlay_size ?? "md";
  const fontClass =
    size === "sm" ? "text-sm font-medium" : size === "lg" ? "text-2xl font-extrabold" : "text-lg font-bold";
  const place =
    position === "top"
      ? "top-24"
      : position === "center"
        ? "top-1/2 -translate-y-1/2"
        : "bottom-28";
  return { place, fontClass, color };
}

/**
 * The story viewer.
 *
 * It plays one author at a time and moves on to the next person when that
 * person's stories have run out. Watching a story records it for the person
 * watching — and only for that person.
 */
export function StoryViewer({
  stories,
  currentUserId,
  startAuthorId,
  onClose,
  onViewed,
  onDelete,
}: StoryViewerProps) {
  const [index, setIndex] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState(false);
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

  // The playback order: the viewer's own stories, then the people who have
  // something unwatched, then the ones already seen. The author who opened the
  // viewer stays at the front while it plays, so watching a story cannot
  // shuffle the picture away under the reader's thumb.
  const groups = useMemo(() => groupStories(stories, currentUserId), [stories, currentUserId]);
  const sequence = useMemo(() => {
    if (!startAuthorId) return playbackSequence(groups);
    const pinned = groups.find((g) => g.author.id === startAuthorId);
    if (!pinned) return playbackSequence(groups);
    return playbackSequence([pinned, ...groups.filter((g) => g.author.id !== startAuthorId)]);
  }, [groups, startAuthorId]);

  const story = index !== null ? sequence[index] ?? null : null;
  const authorStories = story ? sequence.filter((s) => s.author_id === story.author_id) : [];
  const authorIndex = story ? authorStories.findIndex((s) => s.id === story.id) : -1;
  const isOwnStory = story?.author_id === currentUserId;

  // Opening a person's story starts at their first story the viewer has not
  // watched yet.
  const startRef = useRef<string | null>(null);
  useEffect(() => {
    if (!startAuthorId || startRef.current === startAuthorId) return;
    const group = groups.find((g) => g.author.id === startAuthorId);
    if (!group) return;
    const target = group.stories.find((s) => !s.has_viewed) ?? group.stories[0];
    const at = sequence.findIndex((s) => s.id === target.id);
    if (at >= 0) {
      startRef.current = startAuthorId;
      setIndex(at);
      setProgress(0);
      setPaused(false);
    }
  }, [startAuthorId, groups, sequence]);

  const recordView = useCallback(
    async (storyId: string, authorId: string) => {
      if (authorId === currentUserId) return;
      const ok = await markStoryViewed(supabase, storyId, currentUserId);
      if (ok) {
        onViewed?.(storyId);
        refreshStoryRings();
      }
    },
    [supabase, currentUserId, onViewed]
  );

  useEffect(() => {
    if (!story) return;
    setMediaLoading(true);
    setMediaError(false);
    setProgress(0);
    void recordView(story.id, story.author_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  function goNext() {
    if (index === null) return;
    setProgress(0);
    if (index + 1 < sequence.length) setIndex(index + 1);
    else onClose();
  }

  function goPrev() {
    if (index === null) return;
    setProgress(0);
    if (index - 1 >= 0) setIndex(index - 1);
  }

  // Photo stories run on a timer; videos drive the bar themselves and call
  // goNext when they end.
  useEffect(() => {
    if (index === null) return;
    const current = sequence[index];
    if (!current || current.media_type === "video") return;
    // Pause while reply input is open or user is holding down
    if (paused || replyOpen) return;
    const started = Date.now() - progress * STORY_SECONDS;
    const timer = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / STORY_SECONDS);
      setProgress(p);
      if (p >= 1) { window.clearInterval(timer); goNext(); }
    }, 50);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, replyOpen, sequence.length]);

  useEffect(() => {
    if (index === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, sequence]);

  // Reactions of the open author's stories load with the viewer so the chips
  // and the author's counts are there at once.
  useEffect(() => {
    if (!story) return;
    const ids = sequence.filter((s) => s.author_id === story.author_id).map((s) => s.id);
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
  }, [story?.id]);

  async function toggleStoryReaction(target: StoryWithAuthor, emoji: string) {
    const mine = (storyReactions[target.id] || []).find((r) => r.user_id === currentUserId);
    if (mine && mine.emoji === emoji) {
      setStoryReactions((p) => ({ ...p, [target.id]: (p[target.id] || []).filter((r) => r.user_id !== currentUserId) }));
      const { error } = await supabase.from("story_reactions").delete().eq("id", mine.id);
      if (error) toast.error("Could not remove the reaction.");
      return;
    }
    if (mine) {
      setStoryReactions((p) => ({
        ...p,
        [target.id]: (p[target.id] || []).map((r) => (r.user_id === currentUserId ? { ...r, emoji } : r)),
      }));
      const { error } = await supabase.from("story_reactions").update({ emoji }).eq("id", mine.id);
      if (error) toast.error("Could not change the reaction.");
      return;
    }
    const optimistic: StoryReaction = {
      id: `tmp-${Date.now()}`,
      story_id: target.id,
      user_id: currentUserId,
      emoji,
      created_at: new Date().toISOString(),
    };
    setStoryReactions((p) => ({ ...p, [target.id]: [...(p[target.id] || []), optimistic] }));
    const { data, error } = await supabase
      .from("story_reactions")
      .upsert({ story_id: target.id, user_id: currentUserId, emoji }, { onConflict: "story_id,user_id" })
      .select()
      .single();
    if (error || !data) {
      toast.error("Could not react. Has migration 037 been applied?");
      setStoryReactions((p) => ({ ...p, [target.id]: (p[target.id] || []).filter((r) => r.id !== optimistic.id) }));
      return;
    }
    setStoryReactions((p) => ({
      ...p,
      [target.id]: (p[target.id] || []).map((r) => (r.id === optimistic.id ? data : r)),
    }));
    // Notify the story author (skip if reacting to your own story)
    if (target.author_id !== currentUserId) {
      void Promise.resolve(
        supabase.from("notifications").insert({
          user_id: target.author_id,
          actor_id: currentUserId,
          type: "story_reaction",
          entity_id: target.id,
          entity_type: "story",
          message: `Someone reacted ${emoji} to your story`,
        })
      ).catch(() => {});
    }
  }

  // Replying to a story opens (or reuses) the DM thread and attaches the story.
  async function sendReply() {
    if (!story) return;
    const text = replyText.trim();
    if (!text) return;
    // Open or reuse the DM conversation
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantId: story.author_id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.conversationId) { toast.error("Could not open that chat."); return; }
    // Send the message with the story reference
    const { error } = await supabase.from("messages").insert({
      conversation_id: json.conversationId,
      sender_id: currentUserId,
      content: text.slice(0, 2000),
      story_id: story.id,
    });
    if (error) {
      // story_id column missing means migration 037 not applied yet
      if (error.message?.includes("story_id")) {
        // Fall back — send message without story reference
        const { error: err2 } = await supabase.from("messages").insert({
          conversation_id: json.conversationId,
          sender_id: currentUserId,
          content: `↩ Story reply: ${text.slice(0, 2000)}`,
        });
        if (err2) { toast.error("Could not send reply."); return; }
      } else {
        toast.error("Could not reply. Has migration 037 been applied?");
        return;
      }
    }
    // Notify the story author
    void Promise.resolve(
      supabase.from("notifications").insert({
        user_id: story.author_id,
        actor_id: currentUserId,
        type: "story_reply",
        entity_id: story.id,
        entity_type: "story",
        message: `Someone replied to your story`,
      })
    ).catch(() => {});
    setReplyOpen(false);
    setReplyText("");
    toast.success(`Reply sent to ${story.author.display_name}.`);
  }

  // Authors see exactly who watched, newest first.
  async function openViewers() {
    if (!story) return;
    setViewersOpen(true);
    setViewersLoading(true);
    const { data: links } = await supabase
      .from("story_views")
      .select("viewer_id, created_at")
      .eq("story_id", story.id)
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
    const target = sequence.find((s) => s.id === storyId);
    setIndex(null);
    // The stored file has no reason to outlive its row.
    if (target?.media_url && !target.media_url.startsWith("http")) {
      try { await supabase.storage.from("stories").remove([target.media_url]); } catch { /* already gone */ }
    }
    await supabase.from("stories").delete().eq("id", storyId).eq("author_id", currentUserId);
    onDelete?.(storyId);
    refreshStoryRings();
    toast.success("Story deleted.");
  }

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

  if (!story) return null;

  const overlay = overlayText(story);

  return (
    <div className="fixed inset-0 z-[70] bg-black flex items-center justify-center select-none" role="dialog" aria-label="Story viewer">
      {/* Progress segments: one per story of the open author */}
      <div className="absolute top-2 left-2 right-2 flex gap-1 z-30">
        {authorStories.map((s, gi) => (
          <div key={s.id} className="h-0.5 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.25)" }}>
            {gi < authorIndex ? (
              <div className="h-full w-full" style={{ backgroundColor: "rgba(255,255,255,0.9)" }} />
            ) : gi === authorIndex ? (
              <div className="h-full" style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: "rgba(255,255,255,0.9)", transition: "width 60ms linear" }} />
            ) : null}
          </div>
        ))}
      </div>

      {/* Author info */}
      <div className="absolute top-4 left-3 right-3 z-30 flex items-center gap-3">
        <Link href={`/profile/${story.author.username}`} onClick={() => setIndex(null)}>
          <Avatar src={story.author.avatar_url} name={story.author.display_name} size={36} userId={story.author.id} />
        </Link>
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm truncate">
            {story.author.display_name}<AccountBadge account={story.author} />
          </p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
            {formatRelativeTime(story.created_at)}
            {story.audience === "friends" ? " · friends only" : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {isOwnStory && (
            <>
              <button onClick={() => void openViewers()} className="flex items-center gap-1 text-xs text-white/80 hover:text-white" aria-label="See who watched">
                <Eye className="w-4 h-4" /> {story.view_count}
              </button>
              <button onClick={() => void handleDelete(story.id)} className="text-red-400 hover:text-red-300" aria-label="Delete story">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          <button onClick={onClose} className="text-white p-1" aria-label="Close">
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
        {mediaError ? (
          <div className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
            <AlertTriangle className="w-8 h-8" style={{ color: STORY_GOLD_FALLBACK }} />
            <p className="text-white/80 text-sm">This story is no longer available.</p>
          </div>
        ) : story.media_type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={story.id}
            src={story.media_url}
            alt={story.caption || "Story"}
            className="w-full max-h-[80vh] object-contain"
            onLoad={() => setMediaLoading(false)}
            onError={() => { setMediaLoading(false); setMediaError(true); }}
          />
        ) : (
          <video
            key={story.id}
            ref={videoRef}
            src={story.media_url}
            autoPlay
            playsInline
            onLoadedData={() => setMediaLoading(false)}
            onError={() => { setMediaLoading(false); setMediaError(true); }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration > 0) setProgress(Math.min(1, v.currentTime / v.duration));
            }}
            onEnded={goNext}
            className="w-full max-h-[80vh] object-contain"
          />
        )}

        {mediaLoading && !mediaError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-8 h-8 animate-spin text-white/80" />
          </div>
        )}

        {story.caption && (
          <div className={`absolute left-4 right-4 text-center pointer-events-none ${overlay.place}`}>
            <p
              className={`inline-block ${overlay.fontClass} px-3 py-1.5 rounded-xl`}
              style={{ color: overlay.color, textShadow: "0 1px 10px rgba(0,0,0,0.65)" }}
            >
              {story.caption}
            </p>
          </div>
        )}
      </div>

      {/* Footer: the author sees reaction chips, everyone else reacts and replies */}
      <div className="absolute bottom-3 left-3 right-3 z-30">
        {isOwnStory ? (
          (() => {
            const rx = storyReactions[story.id] || [];
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
              placeholder={`Reply to ${story.author.display_name}…`}
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
              Reply to {story.author.display_name.split(" ")[0]}…
            </button>
            {REACTION_EMOJIS.map((e) => (
              <button key={e} onClick={() => void toggleStoryReaction(story, e)}
                className="p-1.5 text-xl leading-none transition-transform hover:scale-125 flex-shrink-0"
                aria-label={`React with ${e}`}>
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

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
    </div>
  );
}

// The gold the brand uses, inlined here so the viewer has no import cycle.
const STORY_GOLD_FALLBACK = "#D6B875";
