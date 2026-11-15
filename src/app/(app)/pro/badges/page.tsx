import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { proMediaUrl } from "@/lib/media";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProFrame } from "@/components/pro/ProFrame";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { BadgeShelf } from "./BadgeShelf";
import { getProStatus } from "@/lib/pro";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Achievement Badges" };

const COUNT_LABEL: Record<string, string> = {
  posts: "posts written",
  comments: "comments left",
  reactions_received: "reactions on your posts",
  friends: "friends",
  followers: "followers",
  stories: "stories posted",
  events: "events hosted",
  quizzes_taken: "quizzes finished",
};

export default async function BadgesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const status = await getProStatus(supabase, user.id);

  const [{ data: badges }, { data: earned }, counts] = await Promise.all([
    supabase.from("badges").select("id, name, description, icon_path, condition_key, threshold").eq("active", true).order("threshold"),
    supabase.from("user_badges").select("badge_id").eq("user_id", user.id),
    supabase.rpc("user_activity_counts", { p_user: user.id }),
  ]);

  const activity = (counts.data ?? {}) as unknown as Record<string, number>;
  const owned = new Set((earned ?? []).map((e) => e.badge_id));

  const rows = (badges ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    icon_url: proMediaUrl(supabase, b.icon_path),
    condition_key: b.condition_key,
    threshold: b.threshold,
    current: Number(activity[b.condition_key] ?? 0),
    earned: owned.has(b.id),
  }));

  return (
    <AppLayout>
      <ProFrame title="Achievement Badges" pro={status.pro} expiresAt={status.expiresAt}
        subtitle="Every badge is a threshold against a real count in your own activity. Nothing here can be bought, and an administrator can withdraw one.">
        {counts.error && (
          <ProDataNote tone="warn">Badges start working when migration 031 is pasted in Supabase.</ProDataNote>
        )}
        <BadgeShelf badges={rows} labels={COUNT_LABEL} canCheck={!counts.error} />
      </ProFrame>
    </AppLayout>
  );
}
