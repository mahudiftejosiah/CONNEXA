import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveSession } from "@/lib/supabase/types";

// Accepts both the browser client and the SSR client without fighting
// supabase-js generic variance (same shape as src/lib/media.ts).
type StorageClient = { storage: SupabaseClient["storage"] };

export const LIVE_BUCKET = "live";

/** How long each rolling clip is: short enough to feel live, long enough that
 *  one upload finishes before the next slice is ready. */
export const CLIP_SLICE_MS = 5000;

/** A broadcaster whose tab died stops touching the session row, so two minutes
 *  of silence means the session is over even while the row still says live. */
export const STALE_MS = 2 * 60 * 1000;

export function clipPath(userId: string, sessionId: string, seq: number) {
  return `${userId}/${sessionId}/${seq}.webm`;
}

export function clipUrl(supabase: StorageClient, path: string) {
  return supabase.storage.from(LIVE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function isLiveFresh(session: Pick<LiveSession, "updated_at"> | null | undefined) {
  if (!session) return false;
  return Date.now() - new Date(session.updated_at).getTime() < STALE_MS;
}

/** The sessions a viewer should actually be shown. */
export function isOpen(s: LiveSession | null | undefined): s is LiveSession {
  return !!s && s.status === "live" && isLiveFresh(s);
}
