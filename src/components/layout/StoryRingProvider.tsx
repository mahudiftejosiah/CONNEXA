"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { storyAuthorIds } from "@/lib/story-audience";

const StoryRingContext = createContext<Set<string>>(new Set());

// People whose avatar should wear the golden "has a story you haven't seen"
// ring. The person looking at the screen is the only judge: the ring belongs to
// whoever has not watched yet, and to nobody else.
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
      // Stories from me, my friends and the people I follow — the same circle
      // the Stories tray shows.
      const ids = await storyAuthorIds(supabase, uid);
      if (ids.length === 0) { if (!cancelled) setRingIds(new Set()); return; }

      const { data: stories } = await supabase
        .from("stories").select("id, author_id")
        .in("author_id", ids)
        .gt("expires_at", new Date().toISOString());
      const rows = stories || [];
      if (rows.length === 0) { if (!cancelled) setRingIds(new Set()); return; }

      const storyIds = rows.map((s) => s.id);
      const { data: views } = storyIds.length
        ? await supabase.from("story_views").select("story_id").eq("viewer_id", uid).in("story_id", storyIds)
        : { data: [] };
      const viewed = new Set((views || []).map((v) => v.story_id));

      // Group the stories by author: the ring stays on while one of that
      // author's stories is still unwatched.
      const byAuthor = new Map<string, string[]>();
      for (const row of rows) {
        byAuthor.set(row.author_id, [...(byAuthor.get(row.author_id) || []), row.id]);
      }

      const next = new Set<string>();
      byAuthor.forEach((idsForAuthor, authorId) => {
        // The person who posted it keeps their own ring for as long as the
        // story lives, whether they have watched it themselves or not.
        if (authorId === uid) { next.add(authorId); return; }
        const allWatched = idsForAuthor.every((id) => viewed.has(id));
        if (!allWatched) next.add(authorId);
      });

      if (!cancelled) setRingIds(next);
    }

    void refresh();
    const onFocus = () => void refresh();
    const poll = setInterval(refresh, 60_000);
    window.addEventListener("focus", onFocus);
    window.addEventListener("connexa-story-refresh", onFocus);

    // A story published right now puts the ring on without waiting for the
    // next tick, and a story somebody just watched takes it off again.
    const channel = supabase
      .channel("story-rings")
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "story_views" }, () => void refresh())
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("connexa-story-refresh", onFocus);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return <StoryRingContext.Provider value={ringIds}>{children}</StoryRingContext.Provider>;
}
