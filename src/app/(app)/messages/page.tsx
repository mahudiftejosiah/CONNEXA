import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { MessagesClient } from "./MessagesClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  // Inbox: fetch ids via participants (one filter, no huge IN list),
  // sort by most recent message, render the 30 newest threads.
  const { data: participantRows } = await supabase
    .from("conversation_participants")
    .select("conversation:conversations!inner(id, last_message_at, created_at)")
    .eq("user_id", user.id);

  type LightConv = { id: string; last_message_at: string | null; created_at: string };
  const recentIds: LightConv[] = (participantRows || [])
    .map((r) => {
      const c = r.conversation as unknown as LightConv | LightConv[] | null;
      return Array.isArray(c) ? c[0] : c;
    })
    .filter((c): c is LightConv => Boolean(c))
    .sort(
      (a, b) =>
        new Date(b.last_message_at || b.created_at).getTime() -
        new Date(a.last_message_at || a.created_at).getTime()
    )
    .slice(0, 30);

  const { data: conversations } = recentIds.length
    ? await supabase
        .from("conversations")
        .select(`
          *,
          participants:conversation_participants(*, profile:profiles(*))
        `)
        .in("id", recentIds.map((c) => c.id))
    : { data: [] };

  const ordered = (conversations || []).sort(
    (a, b) =>
      new Date(b.last_message_at || b.created_at).getTime() -
      new Date(a.last_message_at || a.created_at).getTime()
  );

  // Last message + unread count per thread (parallel, bounded to 30)
  const convWithMessages = await Promise.all(
    ordered.map(async (conv) => {
      const { data: lastMsg } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const { count: unreadCount } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .neq("sender_id", user.id)
        .eq("is_read", false);

      return { ...conv, last_message: lastMsg || null, unread_count: unreadCount || 0 };
    })
  );

  return (
    <AppLayout>
      <MessagesClient
        conversations={convWithMessages as any}
        profile={profile}
        currentUserId={user.id}
      />
    </AppLayout>
  );
}
