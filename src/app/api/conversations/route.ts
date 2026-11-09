import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { participantId } = body as { participantId: string };

  if (!participantId || participantId === user.id) {
    return NextResponse.json({ error: "Invalid participant" }, { status: 400 });
  }

  // Check if blocked
  const { data: block } = await supabase
    .from("user_blocks")
    .select("id")
    .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${participantId}),and(blocker_id.eq.${participantId},blocked_id.eq.${user.id})`)
    .single();
  if (block) return NextResponse.json({ error: "Cannot message this user" }, { status: 403 });

  // Look for a thread that already covers these two people. The peer's ids are
  // checked in batches because a 1000-conversation account puts a request URL
  // past PostgREST's limit if the whole list goes into one in().
  const { data: peerConvs } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", participantId);

  const peerIds = (peerConvs || []).map((r) => r.conversation_id);
  const batches: string[][] = [];
  for (let i = 0; i < peerIds.length; i += 100) batches.push(peerIds.slice(i, i + 100));

  for (const batch of batches) {
    const { data: shared } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id)
      .in("conversation_id", batch)
      .limit(1);

    if (shared && shared.length > 0) {
      // Reopening a chat you deleted brings it back, the way Messenger does.
      // The 019 trigger can only restore the recipient's row — a sender has no
      // right to write another participant's row, so ours is cleared here.
      await supabase
        .from("conversation_participants")
        .update({ deleted_at: null })
        .eq("conversation_id", shared[0].conversation_id)
        .eq("user_id", user.id);
      return NextResponse.json({ conversationId: shared[0].conversation_id });
    }
  }

  // Create new conversation. The id is minted here because a thread with no
  // participants is invisible to RLS, so reading the insert back would fail.
  const conversationId = crypto.randomUUID();
  const { error: convError } = await supabase
    .from("conversations")
    .insert({ id: conversationId } as any);

  if (convError) return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });

  const { error: partError } = await supabase.from("conversation_participants").insert([
    { conversation_id: conversationId, user_id: user.id },
    { conversation_id: conversationId, user_id: participantId },
  ]);

  if (partError) return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });

  return NextResponse.json({ conversationId });
}
