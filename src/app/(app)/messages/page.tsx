import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { MessagesClient } from "./MessagesClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ with?: string }> }) {
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

  // /messages?with=<id> — open (or create) the 1:1 thread with that person.
  const { with: withParam } = await searchParams;
  let openPeerId: string | null = null;
  let forced: any[] = [];
  if (withParam && withParam !== user.id) {
    const peerId = withParam;
    const { data: peer } = await supabase.from("profiles").select("id").eq("id", peerId).maybeSingle();
    if (peer) {
      openPeerId = peerId;
      const { data: mine } = await supabase
        .from("conversation_participants").select("conversation_id").eq("user_id", user.id);
      const myConvIds = Array.from(new Set((mine || []).map((m) => m.conversation_id)));

      let convId: string | null = null;
      for (let i = 0; i < myConvIds.length && !convId; i += 100) {
        const { data } = await supabase.from("conversation_participants")
          .select("conversation_id").in("conversation_id", myConvIds.slice(i, i + 100)).eq("user_id", peerId).limit(1);
        convId = data?.[0]?.conversation_id ?? null;
      }

      if (!convId) {
        // A brand-new thread has no participants yet, so RLS hides it from any
        // read-back — mint the id here and add both people before selecting.
        const newId = crypto.randomUUID();
        const { error: convErr } = await supabase.from("conversations").insert({ id: newId });
        if (!convErr) {
          const { error: partErr } = await supabase.from("conversation_participants").insert([
            { conversation_id: newId, user_id: user.id },
            { conversation_id: newId, user_id: peerId },
          ]);
          if (!partErr) convId = newId;
        }
      }

      if (convId) {
        const { data: conv } = await supabase.from("conversations")
          .select(`*, participants:conversation_participants(*, profile:profiles(*))`)
          .eq("id", convId).single();
        if (conv) {
          const { data: lastMsg } = await supabase.from("messages").select("*")
            .eq("conversation_id", convId).order("created_at", { ascending: false }).limit(1).maybeSingle();
          const { count } = await supabase.from("messages").select("id", { count: "exact", head: true })
            .eq("conversation_id", convId).neq("sender_id", user.id).eq("is_read", false);
          forced = [{ ...conv, last_message: lastMsg || null, unread_count: count || 0 }];
        }
      }
    }
  }

  const threads = [...forced, ...convWithMessages.filter((c) => !forced.some((f) => f.id === c.id))];

  // Friends list for the All / Active / Offline tabs (chunked IN-list so a
  // 1000-friend account cannot overflow the query URL).
  const { data: friendRows } = await supabase
    .from("friendships").select("friend_id").eq("user_id", user.id);
  const friendIds = (friendRows || []).map((r) => r.friend_id);
  const friends: any[] = [];
  for (let i = 0; i < friendIds.length; i += 100) {
    const { data } = await supabase.from("profiles")
      .select("id, username, display_name, avatar_url, last_seen, is_verified")
      .in("id", friendIds.slice(i, i + 100));
    friends.push(...(data || []));
  }

  return (
    <AppLayout>
      <MessagesClient
        conversations={threads as any}
        profile={profile}
        currentUserId={user.id}
        friends={friends}
        openPeerId={openPeerId}
      />
    </AppLayout>
  );
}
