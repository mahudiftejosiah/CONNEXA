"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";
import { storyAuthorIds } from "@/lib/story-audience";

const StoryRingContext = createContext<Set<string>>(new Set());

export function useStoryRings() {
  return useContext(StoryRingContext);
}

export function refreshStoryRings() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("connexa-story-refresh"));
  }
}

export function StoryRingProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: React.ReactNode;
}) {
  const [ringIds, setRingIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!userId) {
      setRingIds(new Set());
      return;
    }

    const supabase = createClient();

    try {
      const authorIds = await storyAuthorIds(supabase, userId);

      if (authorIds.length === 0) {
        setRingIds(new Set());
        return;
      }

      const { data: stories, error: storiesError } = await supabase
        .from("stories")
        .select("id, author_id")
        .in("author_id", authorIds)
        .gt("expires_at", new Date().toISOString());

      if (storiesError) {
        console.error("Story ring loading failed:", storiesError);
        return;
      }

      const activeStories = stories || [];
      const storyIds = activeStories.map((story) => story.id);

      if (storyIds.length === 0) {
        setRingIds(new Set());
        return;
      }

      const { data: views, error: viewsError } = await supabase
        .from("story_views")
        .select("story_id")
        .eq("viewer_id", userId)
        .in("story_id", storyIds);

      if (viewsError) {
        console.error("Story view loading failed:", viewsError);
        return;
      }

      const viewedIds = new Set(
        (views || []).map((view) => view.story_id)
      );

      const nextRingIds = new Set<string>();

      activeStories.forEach((story) => {
        if (!viewedIds.has(story.id)) {
          nextRingIds.add(story.author_id);
        }
      });

      setRingIds(nextRingIds);
    } catch (error) {
      console.error("Unable to refresh story rings:", error);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setRingIds(new Set());
      return;
    }

    let cancelled = false;

    const safeRefresh = async () => {
      if (cancelled) return;
      await refresh();
    };

    void safeRefresh();

    const onFocus = () => {
      void safeRefresh();
    };

    const poll = window.setInterval(() => {
      void safeRefresh();
    }, 30_000);

    window.addEventListener("focus", onFocus);
    window.addEventListener("connexa-story-refresh", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("connexa-story-refresh", onFocus);
    };
  }, [userId, refresh]);

  return (
    <StoryRingContext.Provider value={ringIds}>
      {children}
    </StoryRingContext.Provider>
  );
}