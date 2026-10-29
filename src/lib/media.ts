import type { SupabaseClient } from "@supabase/supabase-js";

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;

// Accepts both the browser client and the SSR client (typed with the Database
// schema) without fighting supabase-js generic variance.
type MediaClient = { storage: SupabaseClient["storage"] };

async function signPaths(
  supabase: MediaClient,
  bucket: string,
  paths: (string | null | undefined)[]
): Promise<Map<string, string>> {
  // Legacy rows may still hold absolute URLs (avatars/covers are public by design).
  const unique = Array.from(
    new Set(paths.filter((p): p is string => !!p && !/^[a-z][a-z0-9+.-]*:\/\//i.test(p)))
  );
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (!error && data) {
    data.forEach((entry, i) => {
      if (entry?.signedUrl) map.set(unique[i], entry.signedUrl);
    });
  }
  return map;
}

/**
 * Replaces storage paths in `media[].url` (and shared-post media) with
 * time-limited signed URLs. Mutates and returns the same array.
 */
export async function signPostMedia<T>(supabase: MediaClient, posts: T[]): Promise<T[]> {
  const urls: (string | null | undefined)[] = [];
  for (const p of posts as any[]) {
    for (const list of [p?.media, p?.shared_post?.media]) {
      if (Array.isArray(list)) urls.push(...list.map((m: any) => m?.url));
    }
  }
  const map = await signPaths(supabase, "post-media", urls);
  if (map.size === 0) return posts;
  for (const p of posts as any[]) {
    for (const list of [p?.media, p?.shared_post?.media]) {
      if (Array.isArray(list)) {
        for (const m of list) if (map.has(m.url)) m.url = map.get(m.url)!;
      }
    }
  }
  return posts;
}

/** Replaces `media_url` storage paths on story rows with signed URLs. */
export async function signStoryMedia<T>(supabase: MediaClient, stories: T[]): Promise<T[]> {
  const map = await signPaths(
    supabase,
    "stories",
    (stories as any[]).map((s) => s?.media_url)
  );
  if (map.size === 0) return stories;
  for (const s of stories as any[]) {
    if (map.has(s.media_url)) s.media_url = map.get(s.media_url)!;
  }
  return stories;
}
