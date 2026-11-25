"use client";

import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { StoriesTray } from "@/components/stories/StoriesTray";
import { CreateStory } from "@/components/stories/CreateStory";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useActiveStories } from "@/lib/useActiveStories";
import { refreshStoryRings } from "@/components/layout/StoryRingProvider";
import type { StoryWithAuthor, Profile } from "@/lib/supabase/types";

interface StoriesClientProps {
  stories: StoryWithAuthor[];
  profile: Profile;
  currentUserId: string;
  openAuthorId?: string | null;
}

export function StoriesClient({ stories: initStories, profile, currentUserId, openAuthorId }: StoriesClientProps) {
  const { stories, setStories } = useActiveStories(initStories, currentUserId);
  const [creating, setCreating] = useState(false);
  const [viewingAuthor, setViewingAuthor] = useState<string | null>(null);

  // /stories?author=<id> opens that person's story straight away.
  useEffect(() => {
    if (openAuthorId) setViewingAuthor(openAuthorId);
  }, [openAuthorId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>Stories</h1>

      {/* The same tray the feed shows, so the two pages are one design */}
      <StoriesTray
        stories={stories}
        profile={profile}
        currentUserId={currentUserId}
        onCreate={() => setCreating(true)}
        onOpen={(authorId) => setViewingAuthor(authorId)}
      />

      {stories.length === 0 && (
        <EmptyState
          icon={<Upload className="w-8 h-8" />}
          title="No active stories"
          description="Stories disappear after 24 hours."
          action={<Button onClick={() => setCreating(true)}>Create story</Button>}
        />
      )}

      {/* The viewer opens over the page — no trip to another screen. */}
      {viewingAuthor && (
        <StoryViewer
          stories={stories}
          currentUserId={currentUserId}
          startAuthorId={viewingAuthor}
          onClose={() => setViewingAuthor(null)}
          onViewed={(storyId) =>
            setStories((p) => p.map((s) => (s.id === storyId ? { ...s, has_viewed: true } : s)))
          }
          onDelete={(storyId) => setStories((p) => p.filter((s) => s.id !== storyId))}
        />
      )}

      <CreateStory
        open={creating}
        onClose={() => setCreating(false)}
        currentUserId={currentUserId}
        onPublished={(story) => {
          // The new story is in the tray straight away — no page reload.
          setStories((p) => [story, ...p.filter((s) => s.id !== story.id)]);
          refreshStoryRings();
        }}
      />
    </div>
  );
}
