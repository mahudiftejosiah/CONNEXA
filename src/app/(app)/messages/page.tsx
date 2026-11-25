import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { MessagesClient } from "./MessagesClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string; tab?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Load all of this user's conversation memberships, including
  // previously deleted conversations. A new message should restore a chat.
  const { data: participantRows } = await supabase
    .from("conversation_participants")
    .select("conversation_id, deleted_at")
    .eq("user_id", user.id);

  const memberships = participantRows || [];

  const myIds = Array.from(
    new Set(memberships.map((row) => row.conversation_id))
  );

  type LightConv = {
    id: string;
    last_message_at: string | null;
    created_at: string;
  };

  const lightRows: LightConv[] = [];

  for (let i = 0; i < myIds.length; i += 100) {
    const { data } = await supabase
      .from("conversations")
      .select("id, last_message_at, created_at")
      .in("id", myIds.slice(i, i + 100));

    lightRows.push(...((data || []) as LightConv[]));
  }

  // Restore a previously deleted chat in the inbox when a newer message
  // has arrived after the user's deletion timestamp.
  const membershipByConversation = new Map(
    memberships.map((row) => [row.conversation_id, row.deleted_at])
  );

  const conversationIds = lightRows
    .filter((conversation) => {
      const deletedAt = membershipByConversation.get(conversation.id);

      if (!deletedAt) return true;

      const lastActivity = conversation.last_message_at
        ? new Date(conversation.last_message_at).getTime()
        : 0;

      return lastActivity > new Date(deletedAt).getTime();
    })
    .map((row) => row.id);

  const { with: withParam, tab: tabParam } = await searchParams;

  const initialTab =
    tabParam === "active" || tabParam === "offline" ? tabParam : "all";

  let openPeerId: string | null = null;
  let forced: any[] = [];

  // Open or create a conversation when /messages?with=<id> is used.
  if (withParam && withParam !== user.id) {
    const peerId = withParam;

    const { data: peer } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", peerId)
      .maybeSingle();

    if (peer) {
      openPeerId = peerId;

      const { data: mine } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      const myConvIds = Array.from(
        new Set((mine || []).map((row) => row.conversation_id))
      );

      let convId: string | null = null;

      for (let i = 0; i < myConvIds.length && !convId; i += 100) {
        const { data } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .in("conversation_id", myConvIds.slice(i, i + 100))
          .eq("user_id", peerId)
          .limit(1);

        convId = data?.[0]?.conversation_id ?? null;
      }

      if (!convId) {
        const newId = crypto.randomUUID();

        const { error: convError } = await supabase
          .from("conversations")
          .insert({ id: newId } as any);

        if (!convError) {
          const { error: participantError } = await supabase
            .from("conversation_participants")
            .insert([
              { conversation_id: newId, user_id: user.id },
              { conversation_id: newId, user_id: peerId },
            ]);

          if (!participantError) {
            convId = newId;
          }
        }
      }

      if (convId) {
        await supabase
          .from("conversation_participants")
          .update({ deleted_at: null })
          .eq("conversation_id", convId)
          .eq("user_id", user.id);

        const { data: conversation } = await supabase
          .from("conversations")
          .select("*, participants:conversation_participants(*)")
          .eq("id", convId)
          .single();

        if (conversation) {
          forced = [conversation];
        }
      }
    }
  }

  // Fetch all conversation records in batches.
  const loadedConversations: any[] = [];

  for (let i = 0; i < conversationIds.length; i += 100) {
    const batch = conversationIds.slice(i, i + 100);

    const { data } = await supabase
      .from("conversations")
      .select("*, participants:conversation_participants(*)")
      .in("id", batch);

    loadedConversations.push(...(data || []));
  }

  // Include directly opened conversations without duplicating them.
  const allConversations = [
    ...forced,
    ...loadedConversations.filter(
      (conversation: any) =>
        !forced.some((item) => item.id === conversation.id)
    ),
  ];

  // Load every participant's profile.
  const participantIds = Array.from(
    new Set(
      allConversations.flatMap((conversation: any) =>
        (conversation.participants || []).map(
          (participant: any) => participant.user_id
        )
      )
    )
  );

  const profileMap = new Map<string, any>();

  for (let i = 0; i < participantIds.length; i += 100) {
    const { data: participantProfiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", participantIds.slice(i, i + 100));

    for (const participantProfile of participantProfiles || []) {
      profileMap.set(participantProfile.id, participantProfile);
    }
  }

  // Attach profiles to participant rows.
  const enrichedConversations = allConversations.map(
    (conversation: any) => ({
      ...conversation,
      participants: (conversation.participants || []).map(
        (participant: any) => ({
          ...participant,
          profile: profileMap.get(participant.user_id) || null,
        })
      ),
    })
  );

  // Load the latest message and unread count.
  const threads = await Promise.all(
    enrichedConversations.map(async (conversation: any) => {
      const { data: lastMessage } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { count: unreadCount } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversation.id)
        .neq("sender_id", user.id)
        .eq("is_read", false);

      return {
        ...conversation,
        last_message: lastMessage || null,
        unread_count: unreadCount || 0,
      };
    })
  );

  // Sort newest conversations first.
  threads.sort((a: any, b: any) => {
    const dateA = new Date(
      a.last_message_at || a.last_message?.created_at || a.created_at
    ).getTime();

    const dateB = new Date(
      b.last_message_at || b.last_message?.created_at || b.created_at
    ).getTime();

    return dateB - dateA;
  });

  // Load friends for the All, Active and Offline tabs.
  const { data: friendRows } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", user.id);

  const friendIds = (friendRows || []).map((row) => row.friend_id);

  const friends: any[] = [];

  for (let i = 0; i < friendIds.length; i += 100) {
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, username, display_name, avatar_url, last_seen, is_verified, pro_expires_at"
      )
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
        initialTab={initialTab}
      />
    </AppLayout>
  );
}