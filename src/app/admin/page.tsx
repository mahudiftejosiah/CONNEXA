import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/layout/AdminShell";
import { AdminClient } from "./AdminClient";
import { getGlobalTheme } from "@/lib/site";
import { getBotPanel } from "@/lib/bot";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin Dashboard" };

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/feed");

  const [usersRes, reportsRes, postsRes, actionsRes, contentRes, gamesRes, reelsRes, upgradesRes, shortcutsRes, booksRes] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("content_reports").select("*, reporter:profiles!content_reports_reporter_id_fkey(*)")
      .eq("status", "pending").order("created_at", { ascending: false }).limit(20),
    supabase.from("posts").select("id", { count: "exact", head: true }),
    supabase.from("moderation_actions").select("*, admin:profiles!moderation_actions_admin_id_fkey(*)")
      .order("created_at", { ascending: false }).limit(10),
    supabase.from("site_content").select("*"),
    supabase.from("external_games").select("*").order("created_at", { ascending: false }),
    supabase.from("reel_embeds").select("*").order("created_at", { ascending: false }),
    supabase.from("account_upgrades")
      .select("*, user:profiles!account_upgrades_user_id_fkey(id, username, display_name, avatar_url, is_verified)")
      .order("created_at", { ascending: false }).limit(40),
    supabase.from("site_shortcuts").select("*").order("sort", { ascending: true }),
    supabase.from("study_books").select("*").order("title", { ascending: true }),
  ]);

  const [totalUsers, totalPosts, totalReports] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("posts").select("id", { count: "exact", head: true }),
    supabase.from("content_reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const globalTheme = await getGlobalTheme();
  const bot = await getBotPanel();

  return (
    <AdminShell profile={profile}>
      <AdminClient
        users={(usersRes.data || []) as any}
        pendingReports={(reportsRes.data || []) as any}
        recentActions={(actionsRes.data || []) as any}
        stats={{
          totalUsers: totalUsers.count || 0,
          totalPosts: totalPosts.count || 0,
          pendingReports: totalReports.count || 0,
        }}
        currentAdminId={user.id}
        siteContent={(contentRes.data || []) as any}
        externalGames={(gamesRes.data || []) as any}
        reelEmbeds={(reelsRes.data || []) as any}
        globalTheme={globalTheme}
        upgrades={(upgradesRes.data || []) as any}
        siteShortcuts={(shortcutsRes.data || []) as any}
        studyBooks={(booksRes.data || []) as any}
        bot={bot}
      />
    </AdminShell>
  );
}
