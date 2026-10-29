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

  // Get conversations this user is in
  const { data: participantRows } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);

  const convIds = (participantRows || []).map((r) => r.conversation_id);

  const { data: conversations } = convIds.length
    ? await supabase
        .from("conversations")
        .select(`
          *,
          participants:conversation_participants(*, profile:profiles(*))
        `)
        .in("id", convIds)
        .order("last_message_at", { ascending: false, nullsFirst: false })
    : { data: [] };

  // Last message per conversation
  const convWithMessages = await Promise.all(
    (conversations || []).map(async (conv) => {
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
