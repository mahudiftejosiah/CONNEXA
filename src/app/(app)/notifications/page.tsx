import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { NotificationsClient } from "./NotificationsClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fire fetch + mark-read in parallel — the UI shows whatever was unread at page load
  const [{ data: notifications }] = await Promise.all([
    supabase
      .from("notifications")
      .select("*, actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_url, is_verified, pro_expires_at)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false),
  ]);

  return (
    <AppLayout>
      <NotificationsClient notifications={(notifications || []) as any} currentUserId={user.id} />
    </AppLayout>
  );
}
