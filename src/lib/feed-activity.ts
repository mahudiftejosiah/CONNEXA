import type { MiniProfile, PostWithAuthor } from "@/lib/supabase/types";

// Works with both the server and browser Supabase clients.
type Queryable = { from: (table: string) => any };

const MINIMAL_PROFILE = "id, username, display_name, avatar_url";

export async function attachFeedActivity(
  supabase: Queryable,
  posts: PostWithAuthor[]
): Promise<PostWithAuthor[]> {
  if (posts.length === 0) return posts;
  const ids = posts.map((p) => p.id);

  const [reactionsRes, commentsRes, repostsRes] = await Promise.all([
    supabase
      .from("reactions")
      .select(`type, post_id, user:profiles!reactions_user_id_fkey(${MINIMAL_PROFILE})`)
      .in("post_id", ids)
      .limit(5000),
    supabase
      .from("comments")
      .select(`id, post_id, content, created_at, author:profiles!comments_author_id_fkey(${MINIMAL_PROFILE})`)
      .in("post_id", ids)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("posts")
      .select(`id, shared_post_id, created_at, author:profiles!posts_author_id_fkey(${MINIMAL_PROFILE})`)
      .eq("is_shared", true)
      .in("shared_post_id", ids)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const breakdownByPost = new Map<string, Record<string, number>>();
  const facesByPost = new Map<string, MiniProfile[]>();
  for (const r of reactionsRes.data || []) {
    if (!r.post_id || !r.user) continue;
    const bd = breakdownByPost.get(r.post_id) ?? {};
    bd[r.type] = (bd[r.type] ?? 0) + 1;
    breakdownByPost.set(r.post_id, bd);
    const faces = facesByPost.get(r.post_id) ?? [];
    if (faces.length < 9) faces.push(r.user as MiniProfile);
    facesByPost.set(r.post_id, faces);
  }

  const commentsByPost = new Map<string, NonNullable<PostWithAuthor["preview_comments"]>>();
  for (const c of commentsRes.data || []) {
    if (!c.post_id || !c.author) continue;
    const list = commentsByPost.get(c.post_id) ?? [];
    if (list.length < 2) list.push({ id: c.id, content: c.content, created_at: c.created_at, author: c.author as MiniProfile });
    commentsByPost.set(c.post_id, list);
  }

  const repostsByPost = new Map<string, MiniProfile[]>();
  for (const s of repostsRes.data || []) {
    if (!s.shared_post_id || !s.author) continue;
    const list = repostsByPost.get(s.shared_post_id) ?? [];
    if (list.length < 6) list.push(s.author as MiniProfile);
    repostsByPost.set(s.shared_post_id, list);
  }

  return posts.map((p) => ({
    ...p,
    reaction_breakdown: breakdownByPost.get(p.id),
    reaction_faces: facesByPost.get(p.id) ?? [],
    preview_comments: commentsByPost.get(p.id) ?? [],
    reposters: repostsByPost.get(p.id) ?? [],
  }));
}
