import { createClient } from "@/lib/supabase/server";

export interface UnreadCounts {
  notifications: number;
  messages: number;
}

export async function getUnreadCounts(): Promise<UnreadCounts> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { notifications: 0, messages: 0 };

  const notifRes = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  // Single indexed SQL count — avoids shipping every conversation id
  // through the API (a huge inbox would exceed request-URL limits).
  const msgRes = await supabase.rpc("unread_message_count", { p_user: user.id });

  return { notifications: notifRes.count ?? 0, messages: Number(msgRes.data ?? 0) };
}
