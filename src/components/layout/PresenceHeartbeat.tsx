"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Writes profiles.last_seen so friends can tell if we are online right now.
export function PresenceHeartbeat({ userId }: { userId: string }) {
  useEffect(() => {
    const supabase = createClient();
    const beat = () => {
      if (document.visibilityState === "hidden") return;
      // postgrest-js only sends the request when the builder is awaited.
      void supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", userId).then(() => {});
    };
    beat();
    const timer = setInterval(beat, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [userId]);

  return null;
}
