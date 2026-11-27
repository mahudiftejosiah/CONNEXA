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

  // One atomic call finds the thread between these two people or creates it.
  // The database holds a unique key per pair, so two people opening a chat at
  // the same moment end up in the same thread instead of two.
  const { data: conversationId, error: rpcError } = await supabase.rpc(
    "get_or_create_direct_conversation",
    { p_other: participantId }
  );

  if (!rpcError && conversationId) {
    return NextResponse.json({ conversationId });
  }

  // Migration 041 has not been pasted yet. Fall back to the old find-then-
  // create so the feature still works, minus the duplicate protection.
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
  const newId = crypto.randomUUID();
  const { error: convError } = await supabase
    .from("conversations")
    .insert({ id: newId } as any);

  if (convError) return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });

  const { error: partError } = await supabase.from("conversation_participants").insert([
    { conversation_id: newId, user_id: user.id },
    { conversation_id: newId, user_id: participantId },
  ]);

  if (partError) return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });

  return NextResponse.json({ conversationId: newId });
}
