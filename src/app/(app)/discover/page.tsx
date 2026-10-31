import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signPostMedia } from "@/lib/media";
import { getBbcNews } from "@/lib/news";
import { AppLayout } from "@/components/layout/AppLayout";
import { DiscoverClient } from "./DiscoverClient";
import { REEL_POOL, shuffleTake } from "@/lib/reel-pool";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Discover" };

export default async function DiscoverPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: friendships } = await supabase
    .from("friendships").select("friend_id").eq("user_id", user.id);
  const friendIds = (friendships || []).map((f) => f.friend_id);

  const { data: me } = await supabase
    .from("profiles").select("interests").eq("id", user.id).single();
  const interests = ((me?.interests || []) as string[]).map((s) => s.toLowerCase());

  const [groupsRes, postsRes, peopleRes, studyRes, sitesRes, booksRes] = await Promise.all([
    supabase.from("groups")
      .select("*, owner:profiles(*)")
      .eq("visibility", "public")
      .order("member_count", { ascending: false })
      .limit(8),
    supabase.from("posts")
      .select("*, author:profiles(*), media:post_media(*)")
      .eq("visibility", "public")
      .is("group_id", null)
      .order("reaction_count", { ascending: false })
      .limit(30),
    supabase.from("profiles")
      .select("*")
      .eq("profile_visibility", "public")
      .neq("id", user.id)
      .limit(30),
    supabase.from("study_resources")
      .select("*, added_by:profiles(id, username, display_name, avatar_url)")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.from("site_shortcuts").select("*").eq("category", "study").order("sort", { ascending: true }),
    supabase.from("study_books").select("*").order("category", { ascending: true }).limit(800),
  ]);

  // Rank trending posts: interest matches dominate, popularity plus a random
  // jitter fills the rest — every refresh surfaces a fresh Facebook-style mix.
  const matchesInterest = (text: string | null) =>
    interests.length > 0 && !!text && interests.some((i) => text.toLowerCase().includes(i));

  const { data: freshPosts } = await supabase
    .from("posts")
    .select("*, author:profiles(*), media:post_media(*)")
    .eq("visibility", "public")
    .is("group_id", null)
    .order("created_at", { ascending: false })
    .limit(30);

  const seenPostIds = new Set<string>();
  const postCandidates = [...(postsRes.data || []), ...(freshPosts || [])]
    .filter((p) => !seenPostIds.has(p.id) && seenPostIds.add(p.id));

  const rankedPosts = postCandidates
    .map((p) => ({ p, score: (matchesInterest(p.content) ? 1_000_000 : 0) + p.reaction_count + Math.random() * 400_000 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((x) => x.p);

  // Suggested people: exclude self + friends, prefer shared interests
  const filteredPeople = (peopleRes.data || []).filter((pp) => !friendIds.includes(pp.id));
  const rankedPeople = filteredPeople
    .map((pp) => ({
      pp,
      score: (pp.interests || []).filter((i: string) => interests.includes(i.toLowerCase())).length + Math.random(),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.pp);

  const trendingPosts = await signPostMedia(supabase, rankedPosts);
  const news = await getBbcNews();

  return (
    <AppLayout>
      <DiscoverClient
        suggestedPeople={(rankedPeople || []) as any}
        publicGroups={(groupsRes.data || []) as any}
        trendingPosts={trendingPosts as any}
        currentUserId={user.id}
        news={news as any}
        studyResources={(studyRes.data || []) as any}
        studySites={(sitesRes.data || []) as any}
        studyBooks={(booksRes.data || []) as any}
        watchReels={shuffleTake(REEL_POOL, 12)}
      />
    </AppLayout>
  );
}
