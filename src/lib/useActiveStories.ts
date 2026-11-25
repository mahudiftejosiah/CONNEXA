"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchActiveStories } from "@/lib/stories";
import type { StoryWithAuthor } from "@/lib/supabase/types";

/**
 * Keeps a list of live stories in step with the database.
 *
 * The list the server rendered is the starting point; after that the stories
 * arrive on their own: a realtime subscription picks up a story the moment it is
 * published, and a slow poll plus a refetch on focus catches the connections
 * whose browser never held a socket open.
 */
export function useActiveStories(initialStories: StoryWithAuthor[], viewerId: string | null) {
  const [stories, setStories] = useState<StoryWithAuthor[]>(initialStories);
  const [refreshing, setRefreshing] = useState(false);
  const hydrated = useRef(initialStories);
  const viewerRef = useRef(viewerId);
  viewerRef.current = viewerId;

  // The server list is only taken once per page load. Later changes come from
  // the database, so a story the viewer has just watched is never undone by a
  // stale prop.
  useEffect(() => {
    if (initialStories !== hydrated.current) {
      hydrated.current = initialStories;
      setStories(initialStories);
    }
  }, [initialStories]);

  const refetch = useCallback(async () => {
    const uid = viewerRef.current;
    if (!uid) return;
    setRefreshing(true);
    try {
      const supabase = createClient();
      const fresh = await fetchActiveStories(supabase, uid);
      if (fresh.length > 0) setStories(fresh);
    } catch {
      // Keep what is on screen; the next tick tries again.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!viewerId) return;

    const supabase = createClient();
    const channel = supabase
      .channel("stories-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stories" },
        () => void refetch()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "story_views" },
        () => void refetch()
      )
      .subscribe();

    const poll = window.setInterval(() => void refetch(), 60_000);
    const onFocus = () => void refetch();
    window.addEventListener("focus", onFocus);
    window.addEventListener("connexa-story-refresh", onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("connexa-story-refresh", onFocus);
    };
  }, [viewerId, refetch]);

  return { stories, setStories, refetch, refreshing };
}
