"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UnreadCounts } from "@/lib/unread-counts";

const UnreadContext = createContext<UnreadCounts>({ notifications: 0, messages: 0 });

export function useUnreadCounts() {
  return useContext(UnreadContext);
}

export function UnreadProvider({
  userId,
  initial,
  children,
}: {
  userId: string | null;
  initial: UnreadCounts;
  children: React.ReactNode;
}) {
  const [counts, setCounts] = useState<UnreadCounts>(initial);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;

    async function refresh() {
      try {
        const res = await fetch("/api/unread-counts", { cache: "no-store" });
        if (res.ok) setCounts((await res.json()) as UnreadCounts);
      } catch {
        // keep last known counts
      }
    }

    function schedule() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(refresh, 400);
    }

    const supabase = createClient();
    const channel = supabase
      .channel("global-unread-counts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        schedule
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, schedule)
      .subscribe();

    const poll = setInterval(refresh, 30_000);
    window.addEventListener("focus", schedule);
    window.addEventListener("connexa-unread-refresh", schedule);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      window.removeEventListener("focus", schedule);
      window.removeEventListener("connexa-unread-refresh", schedule);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [userId]);

  return <UnreadContext.Provider value={counts}>{children}</UnreadContext.Provider>;
}
