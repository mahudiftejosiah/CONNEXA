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

  // notifications has two FKs to profiles (user_id, actor_id), so the embed
  // must name the constraint or PostgREST rejects the whole select.
  const { data: notifications } = await supabase
    .from("notifications")
    .select("*, actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_url)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Mark all as read
  await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);

  return (
    <AppLayout>
      <NotificationsClient notifications={(notifications || []) as any} />
    </AppLayout>
  );
}
