"use client";

import { useState } from "react";
import { X, ChevronLeft, ChevronRight, Eye, Trash2, Upload } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { StoriesTray } from "@/components/stories/StoriesTray";
import { CreateStory } from "@/components/stories/CreateStory";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { refreshStoryRings } from "@/components/layout/StoryRingProvider";
import type { StoryWithAuthor, Profile } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";

interface StoriesClientProps {
  stories: StoryWithAuthor[];
  profile: Profile;
  currentUserId: string;
}

export function StoriesClient({ stories: initStories, profile, currentUserId }: StoriesClientProps) {
  const [stories, setStories] = useState(initStories);
  const [viewing, setViewing] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const grouped = stories.reduce((acc, story) => {
    const id = story.author_id;
    if (!acc[id]) acc[id] = { author: story.author, stories: [] };
    acc[id].stories.push(story);
    return acc;
  }, {} as Record<string, { author: Profile; stories: StoryWithAuthor[] }>);

  const groups = Object.values(grouped);

  async function handleDelete(storyId: string) {
    const supabase = createClient();
    await supabase.from("stories").delete().eq("id", storyId).eq("author_id", currentUserId);
    setStories((p) => p.filter((s) => s.id !== storyId));
    setViewing(null);
    refreshStoryRings();
    toast.success("Story deleted.");
  }

  async function handleView(storyId: string) {
    const supabase = createClient();
    const { data: already } = await supabase.from("story_views")
      .select("id").eq("story_id", storyId).eq("viewer_id", currentUserId).single();
    if (!already) {
      await supabase.from("story_views").insert({ story_id: storyId, viewer_id: currentUserId });
      setStories((p) => p.map((s) => s.id === storyId ? { ...s, has_viewed: true } : s));
      refreshStoryRings();
    }
  }

  const viewingStory = viewing !== null ? stories[viewing] : null;

  // Tray tiles open that author's first story they have not seen yet.
  function openAuthor(authorId: string) {
    const unviewed = stories.findIndex((s) => s.author_id === authorId && !s.has_viewed);
    const i = unviewed === -1 ? stories.findIndex((s) => s.author_id === authorId) : unviewed;
    if (i < 0) return;
    setViewing(i);
    void handleView(stories[i].id);
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
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" role="dialog" aria-label="Story viewer">
          <button onClick={() => setViewing(null)} className="absolute top-4 right-4 text-white z-10 p-2" aria-label="Close">
            <X className="w-6 h-6" />
          </button>
          <button
            onClick={() => setViewing((i) => (i !== null && i > 0 ? i - 1 : null))}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white p-2 hover:bg-white/10 rounded-full"
            aria-label="Previous story"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>

          <div className="relative max-w-sm w-full mx-auto">
            {/* Author info */}
            <div className="absolute top-4 left-4 right-4 z-10 flex items-center gap-3">
              <Link href={`/profile/${viewingStory.author.username}`}>
                <Avatar src={viewingStory.author.avatar_url} name={viewingStory.author.display_name} size={36} userId={viewingStory.author.id} />
              </Link>
              <div>
                <p className="text-white font-semibold text-sm">{viewingStory.author.display_name}</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>{formatRelativeTime(viewingStory.created_at)}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {viewingStory.author_id === currentUserId && (
                  <>
                    <span className="text-xs flex items-center gap-1" style={{ color: "rgba(255,255,255,0.7)" }}>
                      <Eye className="w-3.5 h-3.5" /> {viewingStory.view_count}
                    </span>
                    <button onClick={() => handleDelete(viewingStory.id)} className="text-red-400 hover:text-red-300" aria-label="Delete story">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Media */}
            {viewingStory.media_type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewingStory.media_url} alt="Story" className="w-full max-h-[85vh] object-contain" />
            ) : (
              <video src={viewingStory.media_url} controls autoPlay className="w-full max-h-[85vh] object-contain" />
            )}

            {viewingStory.caption && (
              <div className="absolute bottom-6 left-4 right-4 text-center">
                <p className="text-white text-sm rounded-xl px-3 py-2" style={{ background: "rgba(0,0,0,0.4)" }}>
                  {viewingStory.caption}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              const next = viewing !== null ? viewing + 1 : null;
              if (next !== null && next < stories.length) {
                setViewing(next);
                handleView(stories[next].id);
              } else {
                setViewing(null);
              }
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white p-2 hover:bg-white/10 rounded-full"
            aria-label="Next story"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </div>
      )}

      <CreateStory
        open={creating}
        onClose={() => setCreating(false)}
        currentUserId={currentUserId}
        onPublished={(story) => setStories((p) => [story, ...p])}
      />
    </div>
  );
}
