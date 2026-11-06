"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// "Active now" means the same thing the Messages list already uses: a heartbeat
// in profiles.last_seen within the last five minutes.
const ONLINE_WINDOW_MS = 5 * 60_000;

export function ActiveUsersButton() {
  const [count, setCount] = useState<number | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  supabaseRef.current = supabaseRef.current || createClient();
  const supabase = supabaseRef.current;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!alive || !session) return;
      const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("last_seen", since)
        // Everyone else — the Messages "Active" list shows friends, not the reader,
        // so the header number has to match it.
        .neq("id", session.user.id)
        .then(({ count: total, error }) => {
          if (alive && !error) setCount(total ?? 0);
        });
    };
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [supabase]);

  return (
    <Link
      href="/messages?tab=active"
      className={cn(
        "relative inline-flex items-center gap-1.5 p-2 rounded-xl transition-colors",
        "hover:bg-[var(--border)]"
      )}
      style={{ color: "var(--text-secondary)" }}
      aria-label={count === null ? "See who is active" : `${count} ${count === 1 ? "person" : "people"} active now`}
      title="See who is active"
    >
      <Users className="w-5 h-5" />
      {count !== null && count > 0 && (
        <>
          <span className="active-dot" aria-hidden="true" />
          <span className="hidden sm:inline text-xs font-bold" style={{ color: "rgb(var(--a-600))" }}>
            {count > 99 ? "99+" : count}
          </span>
        </>
      )}
    </Link>
  );
}
