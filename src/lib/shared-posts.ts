import type { SupabaseClient } from "@supabase/supabase-js";

type Client = Pick<SupabaseClient, "from">;

/**
 * Repost embeds can't use `posts!shared_post_id` (PostgREST resolves it as
 * one-to-many children). Fetch original posts in a second query instead.
 */
export async function attachSharedPosts<T extends { is_shared?: boolean; shared_post_id?: string | null }>(
  supabase: Client,
  rows: T[]
): Promise<(T & { shared_post: any | null })[]> {
  const ids = Array.from(
    new Set(rows.filter((r) => r.is_shared && r.shared_post_id).map((r) => r.shared_post_id as string))
  );
  if (ids.length === 0) return rows.map((r) => ({ ...r, shared_post: null }));

  const { data } = await supabase
    .from("posts")
    .select("*, author:profiles(*)")
    .in("id", ids);

  const map = new Map((data || []).map((p: any) => [p.id, p]));
  return rows.map((r) =>
    r.is_shared && r.shared_post_id ? { ...r, shared_post: map.get(r.shared_post_id) ?? null } : { ...r, shared_post: null }
  );
}
