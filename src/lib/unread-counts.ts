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

  const cpRes = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);
  const convIds = cpRes.data?.map((r) => r.conversation_id) ?? [];

  let messages = 0;
  if (convIds.length > 0) {
    const msgRes = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .neq("sender_id", user.id)
      .eq("is_read", false)
      .in("conversation_id", convIds);
    messages = msgRes.count ?? 0;
  }

  return { notifications: notifRes.count ?? 0, messages };
}
