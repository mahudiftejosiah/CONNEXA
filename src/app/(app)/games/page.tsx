import { AppLayout } from "@/components/layout/AppLayout";
import { createClient } from "@/lib/supabase/server";
import GamesClient from "./GamesClient";

export const metadata = { title: "Games" };

export default async function GamesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [gamesRes, sitesRes] = await Promise.all([
    supabase.from("external_games").select("*").order("created_at", { ascending: false }),
    supabase.from("site_shortcuts").select("*").in("category", ["sports", "betting"]).order("sort", { ascending: true }),
  ]);
  const sites = (sitesRes.data || []) as any[];

  // Friends with presence, for the live-game challenge picker (chunked IN-list).
  const friends: any[] = [];
  const scores: any[] = [];
  if (user) {
    const [{ data: rows }, scoreRes] = await Promise.all([
      supabase.from("friendships").select("friend_id").eq("user_id", user.id),
      supabase.from("game_scores").select("game_id, best, points").eq("user_id", user.id),
    ]);
    scores.push(...(scoreRes.data || []));
    const ids = (rows || []).map((r) => r.friend_id);
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase.from("profiles")
        .select("id, username, display_name, avatar_url, last_seen")
        .in("id", ids.slice(i, i + 100));
      friends.push(...(data || []));
    }
  }

  return (
    <AppLayout>
      <GamesClient
        externalGames={(gamesRes.data || []) as any}
        currentUserId={user?.id ?? null}
        sportsSites={sites.filter((s) => s.category === "sports")}
        bettingSites={sites.filter((s) => s.category === "betting")}
        friends={friends}
        myScores={scores}
      />
    </AppLayout>
  );
}
