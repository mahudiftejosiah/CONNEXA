import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type ProRange = "7d" | "30d";

const DAY_MS = 24 * 60 * 60 * 1000;

function windowStart(range: ProRange): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - (range === "7d" ? 6 : 29) * DAY_MS);
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

// A visit is recorded for anyone looking at somebody else's profile. The insert
// is fire-and-forget: before migration 029 the table does not exist, and a
// profile page must never fail because an analytics row could not be written.
export async function recordProfileVisit(supabase: Client, profileId: string, visitorId: string | null) {
  if (!visitorId || visitorId === profileId) return;
  await supabase.from("profile_visits").insert({ profile_id: profileId, visitor_id: visitorId });
}

export type TrendingTag = { tag: string; posts: number };

// Computed from posts that exist right now, never from a canned list. Admins can
// take a tag out of the chart in the PRO management section.
export async function trendingHashtags(supabase: Client, days = 7, limit = 12): Promise<TrendingTag[]> {
  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const [{ data: posts }, blockedRes] = await Promise.all([
    supabase.from("posts").select("id, content, created_at").gte("created_at", since).limit(1000),
    supabase.from("blocked_hashtags").select("tag"),
  ]);

  const blocked = new Set((blockedRes.data ?? []).map((b) => b.tag.toLowerCase()));
  const counts = new Map<string, number>();

  Array.from(posts ?? []).forEach((post) => {
    // Plain ranges instead of \p{L} with the u flag: the token only has to look
    // like a hashtag, and this keeps the syntax inside what the build accepts.
    const found = Array.from(new Set(
      Array.from(String(post.content ?? "").matchAll(/#[\w\u00C0-\u024F\u0400-\u04FF]{2,30}/g))
        .map((m) => m[0].slice(1).toLowerCase())
    ));
    found.forEach((tag) => {
      if (blocked.has(tag)) return;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .map(([tag, postsWith]) => ({ tag, posts: postsWith }))
    .sort((a, b) => b.posts - a.posts || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

export type ProAnalytics = {
  range: ProRange;
  from: string;
  visits: number;
  visitsPrev: number;
  visitors: number;
  followerGain: number;
  followersTotal: number;
  postViews: number;
  postViewsPrev: number;
  reactions: number;
  reactionsPrev: number;
  comments: number;
  commentsPrev: number;
  shares: number;
  postsPublished: number;
  engagementRate: number | null;
  daily: { day: string; visits: number; postViews: number; reactions: number }[];
  topPosts: { id: string; excerpt: string; created_at: string; views: number; reactions: number; comments: number; shares: number }[];
  trackingReady: boolean;
};

function delta(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "0%" : "+100%";
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

export function growthLabel(current: number, previous: number): { text: string; up: boolean } {
  const pct = previous === 0 ? (current === 0 ? 0 : 100) : Math.round(((current - previous) / previous) * 100);
  return { text: delta(current, previous), up: pct >= 0 };
}

// Everything here is a count of real rows. When a table has not been created
// yet the number is 0 and trackingReady says so, instead of inventing a figure.
export async function proAnalytics(supabase: Client, userId: string, range: ProRange): Promise<ProAnalytics> {
  const from = windowStart(range);
  const prevFrom = new Date(from.getTime() - (from ? (range === "7d" ? 7 : 30) : 7) * DAY_MS);
  const fromIso = from.toISOString();
  const prevFromIso = prevFrom.toISOString();

  const [{ data: myPosts }, followersTotal, followerGain] = await Promise.all([
    supabase.from("posts").select("id, content, created_at, reaction_count, comment_count, share_count")
      .eq("author_id", userId).neq("visibility", "only_me"),
    supabase.from("followers").select("id", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("followers").select("id", { count: "exact", head: true })
      .eq("following_id", userId).gte("created_at", fromIso),
  ]);

  const postIds = (myPosts ?? []).map((p) => p.id);

  const emptyIds = postIds.length === 0;
  const [visitsRes, visitsPrevRes, viewsRes, viewsPrevRes, reactionsRes, reactionsPrevRes, commentsRes, commentsPrevRes, sharesRes] =
    await Promise.all([
      supabase.from("profile_visits")
        .select("visitor_id, visited_at").eq("profile_id", userId).gte("visited_at", fromIso),
      supabase.from("profile_visits")
        .select("id", { count: "exact", head: true }).eq("profile_id", userId)
        .gte("visited_at", prevFromIso).lt("visited_at", fromIso),
      emptyIds ? Promise.resolve({ data: [] as { post_id: string; viewed_at: string }[] })
        : supabase.from("post_views").select("post_id, viewed_at").in("post_id", postIds).gte("viewed_at", fromIso),
      emptyIds ? Promise.resolve({ count: 0 } as { count: number | null })
        : supabase.from("post_views").select("id", { count: "exact", head: true }).in("post_id", postIds)
          .gte("viewed_at", prevFromIso).lt("viewed_at", fromIso),
      emptyIds ? Promise.resolve({ data: [] as { created_at: string }[] })
        : supabase.from("reactions").select("created_at").in("post_id", postIds).gte("created_at", fromIso),
      emptyIds ? Promise.resolve({ count: 0 } as { count: number | null })
        : supabase.from("reactions").select("id", { count: "exact", head: true }).in("post_id", postIds)
          .gte("created_at", prevFromIso).lt("created_at", fromIso),
      emptyIds ? Promise.resolve({ count: 0 } as { count: number | null })
        : supabase.from("comments").select("id", { count: "exact", head: true }).in("post_id", postIds).gte("created_at", fromIso),
      emptyIds ? Promise.resolve({ count: 0 } as { count: number | null })
        : supabase.from("comments").select("id", { count: "exact", head: true }).in("post_id", postIds)
          .gte("created_at", prevFromIso).lt("created_at", fromIso),
      emptyIds ? Promise.resolve({ count: 0 } as { count: number | null })
        : supabase.from("posts").select("id", { count: "exact", head: true }).in("shared_post_id", postIds)
          .gte("created_at", fromIso),
    ]);

  const visits = visitsRes.data?.length ?? 0;
  // The tables arrive with migration 029. Until then the counts are honestly
  // zero and the dashboard says so instead of dressing the page up.
  const trackingReady = !visitsRes.error;
  const visitors = new Set((visitsRes.data ?? []).map((v) => v.visitor_id).filter(Boolean)).size;

  const viewsByPost = new Map<string, number>();
  for (const row of viewsRes.data ?? []) viewsByPost.set(row.post_id, (viewsByPost.get(row.post_id) ?? 0) + 1);

  const days: ProAnalytics["daily"] = [];
  const bucket = new Map<string, { visits: number; postViews: number; reactions: number }>();
  for (let i = 0; i < (range === "7d" ? 7 : 30); i += 1) {
    const d = new Date(from.getTime() + i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    bucket.set(key, { visits: 0, postViews: 0, reactions: 0 });
  }
  for (const row of visitsRes.data ?? []) {
    const b = bucket.get(dayKey(row.visited_at));
    if (b) b.visits += 1;
  }
  for (const row of viewsRes.data ?? []) {
    const b = bucket.get(dayKey(row.viewed_at));
    if (b) b.postViews += 1;
  }
  for (const row of reactionsRes.data ?? []) {
    const b = bucket.get(dayKey(row.created_at));
    if (b) b.reactions += 1;
  }
  Array.from(bucket.entries()).forEach(([day, v]) => days.push({ day, ...v }));

  const reactions = reactionsRes.data?.length ?? 0;
  const comments = commentsRes.count ?? 0;
  const shares = sharesRes.count ?? 0;
  const postViews = viewsRes.data?.length ?? 0;
  const reach = postViews > 0 ? postViews : null;
  const interactions = reactions + comments + shares;

  const topPosts = (myPosts ?? [])
    .map((p) => ({
      id: p.id,
      excerpt: String(p.content ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || "Post with media",
      created_at: p.created_at,
      views: viewsByPost.get(p.id) ?? 0,
      reactions: p.reaction_count ?? 0,
      comments: p.comment_count ?? 0,
      shares: p.share_count ?? 0,
    }))
    .filter((p) => p.created_at >= fromIso)
    .sort((a, b) => (b.views + b.reactions + b.comments) - (a.views + a.reactions + a.comments))
    .slice(0, 8);

  const postsPublished = (myPosts ?? []).filter((p) => p.created_at >= fromIso).length;

  return {
    range,
    from: fromIso,
    visits,
    visitsPrev: visitsPrevRes.count ?? 0,
    visitors,
    followerGain: followerGain.count ?? 0,
    followersTotal: followersTotal.count ?? 0,
    postViews,
    postViewsPrev: viewsPrevRes.count ?? 0,
    reactions,
    reactionsPrev: reactionsPrevRes.count ?? 0,
    comments,
    commentsPrev: commentsPrevRes.count ?? 0,
    shares,
    postsPublished,
    engagementRate: reach && reach > 0 ? Math.round((interactions / reach) * 1000) / 10 : null,
    daily: days.sort((a, b) => a.day.localeCompare(b.day)),
    topPosts,
    trackingReady,
  };
}
