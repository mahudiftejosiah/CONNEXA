import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminClient } from "./AdminClient";
import { getGlobalTheme } from "@/lib/site";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin Dashboard" };

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/feed");

  const [usersRes, reportsRes, postsRes, actionsRes, contentRes, gamesRes] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("content_reports").select("*, reporter:profiles!content_reports_reporter_id_fkey(*)")
      .eq("status", "pending").order("created_at", { ascending: false }).limit(20),
    supabase.from("posts").select("id", { count: "exact", head: true }),
    supabase.from("moderation_actions").select("*, admin:profiles!moderation_actions_admin_id_fkey(*)")
      .order("created_at", { ascending: false }).limit(10),
    supabase.from("site_content").select("*"),
    supabase.from("external_games").select("*").order("created_at", { ascending: false }),
  ]);

  const [totalUsers, totalPosts, totalReports] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("posts").select("id", { count: "exact", head: true }),
    supabase.from("content_reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const globalTheme = await getGlobalTheme();

  return (
    <AppLayout>
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
        globalTheme={globalTheme}
      />
    </AppLayout>
  );
}
