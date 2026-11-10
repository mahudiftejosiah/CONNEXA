"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const StoryRingContext = createContext<Set<string>>(new Set());

// People whose avatar should wear the green "has a story you haven't seen" ring.
export function useStoryRings() {
  return useContext(StoryRingContext);
}

export function refreshStoryRings() {
  window.dispatchEvent(new Event("connexa-story-refresh"));
}

export function StoryRingProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: React.ReactNode;
}) {
  const [ringIds, setRingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) { setRingIds(new Set()); return; }
    const uid = userId;
    const supabase = createClient();
    let cancelled = false;

    async function refresh() {
      // Stories from me + my friends, the same circle the Stories tray shows.
      const { data: friendships } = await supabase
        .from("friendships").select("friend_id").eq("user_id", uid);
      const ids = [uid, ...(friendships || []).map((f) => f.friend_id)].slice(0, 100);
      const { data: stories } = await supabase
        .from("stories").select("id, author_id")
        .in("author_id", ids)
        .gt("expires_at", new Date().toISOString());
      const rows = stories || [];
      const storyIds = rows.map((s) => s.id);
      const { data: views } = storyIds.length
        ? await supabase.from("story_views").select("story_id").eq("viewer_id", uid).in("story_id", storyIds)
        : { data: [] };
      const viewed = new Set((views || []).map((v) => v.story_id));
      const next = new Set<string>();
      rows.forEach((s) => { if (!viewed.has(s.id)) next.add(s.author_id); });
      if (!cancelled) setRingIds(next);
    }

    void refresh();
    const onFocus = () => void refresh();
    const poll = setInterval(refresh, 60_000);
    window.addEventListener("focus", onFocus);
    window.addEventListener("connexa-story-refresh", onFocus);
    return () => {
      cancelled = true;
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("connexa-story-refresh", onFocus);
    };
  }, [userId]);

  return <StoryRingContext.Provider value={ringIds}>{children}</StoryRingContext.Provider>;
}