"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { initialChess } from "@/lib/games/chess";
import { initialWhot } from "@/lib/games/whot";
import { initialLudo } from "@/lib/games/ludo";

export type LiveGameKind = "whot" | "chess" | "ludo";

const GAME_LABEL: Record<LiveGameKind, string> = { whot: "Whot", chess: "Chess", ludo: "Ludo" };

function freshState(game: LiveGameKind) {
  if (game === "chess") return initialChess() as unknown as Record<string, unknown>;
  if (game === "whot") return initialWhot() as unknown as Record<string, unknown>;
  return initialLudo() as unknown as Record<string, unknown>;
}

async function meName(supabase: any, id: string) {
  const { data } = await supabase.from("profiles").select("display_name").eq("id", id).single();
  return data?.display_name || "Someone";
}

async function notify(supabase: any, args: {
  userId: string; actorId: string; requestId: string; message: string;
}) {
  await supabase.from("notifications").insert({
    user_id: args.userId,
    actor_id: args.actorId,
    type: "game_request",
    entity_id: args.requestId,
    entity_type: "game_request",
    message: args.message,
  });
}

export async function challengeFriend(game: LiveGameKind, opponentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to play live games." };
  if (!opponentId || opponentId === user.id) return { error: "Choose a friend to challenge." };

  const { data: row, error } = await supabase
    .from("game_requests")
    .insert({ game, challenger_id: user.id, opponent_id: opponentId, status: "pending" })
    .select("id")
    .single();
  if (error || !row) return { error: "Could not send the challenge. (Run migration 013 in Supabase.)" };

  const name = await meName(supabase, user.id);
  await notify(supabase, { userId: opponentId, actorId: user.id, requestId: row.id, message: `${name} challenged you to ${GAME_LABEL[game]}` });

  revalidatePath("/games");
  return { success: true, id: row.id };
}

export async function cancelChallenge(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: req } = await supabase.from("game_requests").select("*").eq("id", id).single();
  if (!req || req.challenger_id !== user.id || req.status !== "pending") return { error: "Nothing to cancel." };

  const { error } = await supabase.from("game_requests").update({ status: "cancelled" }).eq("id", id);
  if (error) return { error: "Could not cancel the challenge." };

  const name = await meName(supabase, user.id);
  await notify(supabase, { userId: req.opponent_id, actorId: user.id, requestId: id, message: `${name} cancelled the ${GAME_LABEL[req.game]} challenge` });
  revalidatePath(`/games/live/${id}`);
  return { success: true };
}

export async function respondToChallenge(id: string, accept: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: req } = await supabase.from("game_requests").select("*").eq("id", id).single();
  if (!req || req.opponent_id !== user.id || req.status !== "pending") return { error: "This challenge is no longer open." };

  const name = await meName(supabase, user.id);
  if (!accept) {
    const { error } = await supabase.from("game_requests").update({ status: "declined" }).eq("id", id);
    if (error) return { error: "Could not decline." };
    await notify(supabase, { userId: req.challenger_id, actorId: user.id, requestId: id, message: `${name} declined your ${GAME_LABEL[req.game]} challenge` });
    revalidatePath(`/games/live/${id}`);
    return { success: true };
  }

  const { error } = await supabase.from("game_requests").update({
    status: "accepted",
    state: freshState(req.game as LiveGameKind) as never,
    turn: req.challenger_id,
  }).eq("id", id);
  if (error) return { error: "Could not start the game. (Run migration 013 in Supabase.)" };

  await notify(supabase, { userId: req.challenger_id, actorId: user.id, requestId: id, message: `${name} accepted your ${GAME_LABEL[req.game]} challenge` });
  revalidatePath(`/games/live/${id}`);
  return { success: true };
}

export async function submitGameState(id: string, state: Record<string, unknown>, turnUserId: string | null, winnerId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: req } = await supabase.from("game_requests").select("*").eq("id", id).single();
  if (!req || !["accepted", "pending"].includes(req.status)) return { error: "This game is not live." };
  const isPlayer = req.challenger_id === user.id || req.opponent_id === user.id;
  if (!isPlayer) return { error: "You are not in this game." };

  const patch: Record<string, unknown> = { state: state as never, turn: turnUserId as never, updated_at: new Date().toISOString() };
  if (winnerId) { patch.winner_id = winnerId; patch.status = "done"; }

  const { error } = await supabase.from("game_requests").update(patch as never).eq("id", id);
  if (error) return { error: "Move did not save." };

  if (winnerId) {
    const loser = winnerId === req.challenger_id ? req.opponent_id : req.challenger_id;
    const winnerName = await meName(supabase, winnerId);
    await notify(supabase, { userId: loser, actorId: winnerId, requestId: id, message: `${winnerName} won the ${GAME_LABEL[req.game]} game` });
  }
  return { success: true };
}

export async function requestRematch(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: req } = await supabase.from("game_requests").select("*").eq("id", id).single();
  if (!req) return { error: "Game not found." };
  const opponentId = req.challenger_id === user.id ? req.opponent_id : req.challenger_id;

  const { data: row, error } = await supabase.from("game_requests").insert({
    game: req.game,
    challenger_id: user.id,
    opponent_id: opponentId,
    status: "pending",
  }).select("id").single();
  if (error || !row) return { error: "Could not start a rematch." };

  const name = await meName(supabase, user.id);
  await notify(supabase, { userId: opponentId, actorId: user.id, requestId: row.id, message: `${name} wants a rematch in ${GAME_LABEL[req.game]}` });
  return { success: true, id: row.id };
}
