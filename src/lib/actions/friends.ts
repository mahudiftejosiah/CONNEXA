"use server";

import { createClient } from "@/lib/supabase/server";
import { getProStatus } from "@/lib/pro";
import { revalidatePath } from "next/cache";

// How many friends an account has. Counted from the real friendship rows, so a
// number can never be inflated here.
async function friendCount(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { count } = await supabase.from("friendships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

// Requests sent since local midnight, which is what "per day" means to the user.
async function requestsToday(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const { count } = await supabase.from("friend_requests")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", userId)
    .gte("created_at", midnight.toISOString());
  return count ?? 0;
}

export async function sendFriendRequest(receiverId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  if (user.id === receiverId) return { error: "Cannot add yourself." };

  // Check not blocked
  const { data: block } = await supabase.from("user_blocks")
    .select("id").or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`)
    .or(`blocker_id.eq.${receiverId},blocked_id.eq.${receiverId}`)
    .single();
  if (block) return { error: "Cannot send request." };

  const pro = await getProStatus(supabase, user.id);
  const friends = await friendCount(supabase, user.id);
  if (friends >= pro.friendLimit) {
    return { error: pro.pro
      ? `Your PRO account already has its full ${pro.friendLimit.toLocaleString()} friends.`
      : `You have reached the limit of ${pro.friendLimit.toLocaleString()} friends. CONNEXA PRO raises it to 10,000.` };
  }
  if (pro.dailyRequestLimit !== null && (await requestsToday(supabase, user.id)) >= pro.dailyRequestLimit) {
    return { error: "You have sent 50 friend requests today. Try again tomorrow, or upgrade to PRO." };
  }

  const { error } = await supabase.from("friend_requests").insert({ sender_id: user.id, receiver_id: receiverId });
  if (error) return { error: "Request already exists or could not be sent." };

  // Notify
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
  await supabase.from("notifications").insert({
    user_id: receiverId, actor_id: user.id, type: "friend_request",
    entity_id: user.id, entity_type: "profile",
    message: `${profile?.display_name || "Someone"} sent you a friend request`,
  });

  revalidatePath("/friends");
  return { success: true };
}

export async function acceptFriendRequest(requestId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: req } = await supabase.from("friend_requests").select("*").eq("id", requestId).single();
  if (!req || req.receiver_id !== user.id) return { error: "Unauthorized" };

  // Accepting makes two friendships, so the accepting account's own ceiling is
  // checked here too — a request sent before the limit was reached still stops.
  const pro = await getProStatus(supabase, user.id);
  if ((await friendCount(supabase, user.id)) >= pro.friendLimit) {
    return { error: `You have reached the limit of ${pro.friendLimit.toLocaleString()} friends.` };
  }

  await supabase.from("friend_requests").update({ status: "accepted" }).eq("id", requestId);

  // Create bidirectional friendship
  await supabase.from("friendships").insert([
    { user_id: user.id, friend_id: req.sender_id },
    { user_id: req.sender_id, friend_id: user.id },
  ]);

  // Notify sender
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
  await supabase.from("notifications").insert({
    user_id: req.sender_id, actor_id: user.id, type: "friend_accepted",
    entity_id: user.id, entity_type: "profile",
    message: `${profile?.display_name || "Someone"} accepted your friend request`,
  });

  revalidatePath("/friends");
  return { success: true };
}

export async function rejectFriendRequest(requestId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: req } = await supabase.from("friend_requests").select("receiver_id").eq("id", requestId).single();
  if (!req || req.receiver_id !== user.id) return { error: "Unauthorized" };

  await supabase.from("friend_requests").update({ status: "rejected" }).eq("id", requestId);
  revalidatePath("/friends");
  return { success: true };
}

export async function cancelFriendRequest(requestId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: req } = await supabase.from("friend_requests").select("sender_id").eq("id", requestId).single();
  if (!req || req.sender_id !== user.id) return { error: "Unauthorized" };

  await supabase.from("friend_requests").delete().eq("id", requestId);
  revalidatePath("/friends");
  return { success: true };
}

export async function removeFriend(friendId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  await supabase.from("friendships").delete()
    .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`);

  revalidatePath("/friends");
  return { success: true };
}

export async function toggleFollow(targetId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  if (user.id === targetId) return { error: "Cannot follow yourself." };

  const { data: existing } = await supabase.from("followers")
    .select("id").eq("follower_id", user.id).eq("following_id", targetId).single();

  if (existing) {
    await supabase.from("followers").delete().eq("id", existing.id);
    return { following: false };
  } else {
    await supabase.from("followers").insert({ follower_id: user.id, following_id: targetId });

    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
    await supabase.from("notifications").insert({
      user_id: targetId, actor_id: user.id, type: "new_follower",
      entity_id: user.id, entity_type: "profile",
      message: `${profile?.display_name || "Someone"} started following you`,
    });

    return { following: true };
  }
}

export async function toggleBlock(targetId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  if (user.id === targetId) return { error: "Cannot block yourself." };

  const { data: existing } = await supabase.from("user_blocks")
    .select("id").eq("blocker_id", user.id).eq("blocked_id", targetId).single();

  if (existing) {
    await supabase.from("user_blocks").delete().eq("id", existing.id);
    return { blocked: false };
  } else {
    // Remove friendship if exists
    await supabase.from("friendships").delete()
      .or(`and(user_id.eq.${user.id},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${user.id})`);
    // Remove follow
    await supabase.from("followers").delete()
      .or(`and(follower_id.eq.${user.id},following_id.eq.${targetId}),and(follower_id.eq.${targetId},following_id.eq.${user.id})`);

    await supabase.from("user_blocks").insert({ blocker_id: user.id, blocked_id: targetId });
    return { blocked: true };
  }
}
