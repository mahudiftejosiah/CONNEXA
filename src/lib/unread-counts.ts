import { createClient } from "@/lib/supabase/server";

export interface UnreadCounts {
  notifications: number;
  messages: number;
}

export async function getUnreadCounts(): Promise<UnreadCounts> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { notifications: 0, messages: 0 };

    const notifRes = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    // Fall back to 0 if the RPC doesn't exist yet (migration 011 not applied)
    let msgCount = 0;
    try {
      const msgRes = await supabase.rpc("unread_message_count", { p_user: user.id });
      msgCount = Number(msgRes.data ?? 0);
    } catch {
      // Migration 011 not yet applied — not a fatal error
    }

    return { notifications: notifRes.count ?? 0, messages: msgCount };
  } catch {
    return { notifications: 0, messages: 0 };
  }
}
