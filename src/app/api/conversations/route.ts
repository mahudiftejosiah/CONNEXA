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

  // Check if conversation already exists between these two users
  const { data: existing } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);

  const myConvIds = (existing || []).map((r) => r.conversation_id);

  if (myConvIds.length > 0) {
    const { data: shared } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", participantId)
      .in("conversation_id", myConvIds);

    if (shared && shared.length > 0) {
      return NextResponse.json({ conversationId: shared[0].conversation_id });
    }
  }

  // Create new conversation. The id is minted here because a thread with no
  // participants is invisible to RLS, so reading the insert back would fail.
  const conversationId = crypto.randomUUID();
  const { error: convError } = await supabase
    .from("conversations")
    .insert({ id: conversationId });

  if (convError) return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });

  const { error: partError } = await supabase.from("conversation_participants").insert([
    { conversation_id: conversationId, user_id: user.id },
    { conversation_id: conversationId, user_id: participantId },
  ]);

  if (partError) return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });

  return NextResponse.json({ conversationId });
}
