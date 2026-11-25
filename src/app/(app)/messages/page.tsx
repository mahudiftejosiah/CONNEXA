import { redirect } from “next/navigation”;
import { createClient } from “@/lib/supabase/server”;
import { AppLayout } from “@/components/layout/AppLayout”;
import { MessagesClient } from “./MessagesClient”;
import type { Metadata } from “next”;

export const metadata: Metadata = { title: “Messages” };

export default async function MessagesPage({
searchParams,
}: {
searchParams: Promise<{ with?: string; tab?: string }>;
}) {
const supabase = await createClient();

const {
data: { user },
} = await supabase.auth.getUser();

if (!user) redirect(”/login”);

const { data: profile } = await supabase
.from(“profiles”)
.select(”*”)
.eq(“id”, user.id)
.single();

if (!profile) redirect(”/login”);

// Get conversations visible in this user’s inbox.
const filtered = await supabase
.from(“conversation_participants”)
.select(“conversation_id”)
.eq(“user_id”, user.id)
.is(“deleted_at”, null);

const { data: participantRows } = filtered.error
? await supabase
.from(“conversation_participants”)
.select(“conversation_id”)
.eq(“user_id”, user.id)
: filtered;

const myIds = Array.from(
new Set((participantRows || []).map((row) => row.conversation_id))
);

type LightConv = {
id: string;
last_message_at: string | null;
created_at: string;
};

const lightRows: LightConv[] = [];

for (let i = 0; i < myIds.length; i += 100) {
const { data } = await supabase
.from(“conversations”)
.select(“id, last_message_at, created_at”)
.in(“id”, myIds.slice(i, i + 100));

lightRows.push(...((data || []) as LightConv[]));

}

const recentIds = lightRows
.sort(
(a, b) =>
new Date(b.last_message_at || b.created_at).getTime() -
new Date(a.last_message_at || a.created_at).getTime()
)
.slice(0, 30);

// Fetch conversations and participants separately from profiles.
const { data: conversations } = recentIds.length
? await supabase
.from(“conversations”)
.select(”, participants:conversation_participants()”)
.in(
“id”,
recentIds.map((conversation) => conversation.id)
)
: { data: [] };

const { with: withParam, tab: tabParam } = await searchParams;

const initialTab =
tabParam === “active” || tabParam === “offline” ? tabParam : “all”;

let openPeerId: string | null = null;
let forced: any[] = [];

// Open or create a conversation when /messages?with= is used.
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
      if (!participantError) convId = newId;
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

// Combine normal and directly opened conversations.
const allConversations = [
…forced,
…(conversations || []).filter(
(conversation: any) =>
!forced.some((item) => item.id === conversation.id)
),
];

// Fetch participant profiles separately.
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
.from(“profiles”)
.select(”*”)
.in(“id”, participantIds.slice(i, i + 100));

for (const participantProfile of participantProfiles || []) {
  profileMap.set(participantProfile.id, participantProfile);
}

}

// Attach profiles to each participant.
const enrichedConversations = allConversations.map(
(conversation: any) => ({
…conversation,
participants: (conversation.participants || []).map(
(participant: any) => ({
…participant,
profile: profileMap.get(participant.user_id) || null,
})
),
})
);

// Load latest message and unread count for every conversation.
const threads = await Promise.all(
enrichedConversations.map(async (conversation: any) => {
const { data: lastMessage } = await supabase
.from(“messages”)
.select(”*”)
.eq(“conversation_id”, conversation.id)
.order(“created_at”, { ascending: false })
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

// Load friends for the All, Active and Offline tabs.
const { data: friendRows } = await supabase
.from(“friendships”)
.select(“friend_id”)
.eq(“user_id”, user.id);

const friendIds = (friendRows || []).map((row) => row.friend_id);

const friends: any[] = [];

for (let i = 0; i < friendIds.length; i += 100) {
const { data } = await supabase
.from(“profiles”)
.select(
“id, username, display_name, avatar_url, last_seen, is_verified, pro_expires_at”
)
.in(“id”, friendIds.slice(i, i + 100));

friends.push(...(data || []));

}

return (
<MessagesClient
conversations={threads as any}
profile={profile}
currentUserId={user.id}
friends={friends}
openPeerId={openPeerId}
initialTab={initialTab}
/>
);
}