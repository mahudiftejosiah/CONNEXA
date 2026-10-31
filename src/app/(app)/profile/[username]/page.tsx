import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signPostMedia } from "@/lib/media";
import { attachSharedPosts } from "@/lib/shared-posts";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProfileClient } from "./ProfileClient";
import type { Metadata } from "next";

interface Props { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("username", username).single();
  if (!profile) notFound();

  const { data: currentProfile } = user
    ? await supabase.from("profiles").select("*").eq("id", user.id).single()
    : { data: null };

  const isOwn = user?.id === profile.id;

  let isFriend = false;
  let isFollowing = false;
  let isBlocked = false;
  let friendRequestStatus: "none" | "sent" | "received" = "none";
  let friendRequestId: string | null = null;

  if (user && !isOwn) {
    const [friendRes, followRes, blockRes, reqSentRes, reqReceivedRes] = await Promise.all([
      supabase.from("friendships").select("id").eq("user_id", user.id).eq("friend_id", profile.id).single(),
      supabase.from("followers").select("id").eq("follower_id", user.id).eq("following_id", profile.id).single(),
      supabase.from("user_blocks").select("id")
        .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${profile.id}),and(blocker_id.eq.${profile.id},blocked_id.eq.${user.id})`)
        .single(),
      supabase.from("friend_requests").select("id").eq("sender_id", user.id).eq("receiver_id", profile.id).eq("status", "pending").single(),
      supabase.from("friend_requests").select("id").eq("sender_id", profile.id).eq("receiver_id", user.id).eq("status", "pending").single(),
    ]);

    isFriend = !!friendRes.data;
    isFollowing = !!followRes.data;
    isBlocked = !!blockRes.data;
    if (reqSentRes.data) { friendRequestStatus = "sent"; friendRequestId = reqSentRes.data.id; }
    else if (reqReceivedRes.data) { friendRequestStatus = "received"; friendRequestId = reqReceivedRes.data.id; }
  }

  const [followersCount, followingCount, friendsCount] = await Promise.all([
    supabase.from("followers").select("id", { count: "exact", head: true }).eq("following_id", profile.id),
    supabase.from("followers").select("id", { count: "exact", head: true }).eq("follower_id", profile.id),
    supabase.from("friendships").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
  ]);

  // Build the query — apply visibility filter only for other users
  const baseQuery = supabase
    .from("posts")
    .select(`*, author:profiles(*), media:post_media(*)`)
    .eq("author_id", profile.id)
    .is("group_id", null)
    .order("created_at", { ascending: false })
    .limit(12);

  const { data: posts } = isOwn
    ? await baseQuery
    : isFriend
      ? await baseQuery.or("visibility.eq.public,visibility.eq.friends")
      : await baseQuery.eq("visibility", "public");

  // Upgrade / verification info (own profile)
  const [{ data: upgradeContent }, ownUpgrade] = await Promise.all([
    supabase.from("site_content").select("body").eq("key", "upgrade").single(),
    isOwn && user
      ? supabase.from("account_upgrades")
          .select("status, reference")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null as { status: "pending" | "approved" | "rejected"; reference: string } | null }),
  ]);
  const upgradeConfigText =
    upgradeContent?.body ||
    "PRICE: 0\nPAY TO ACCOUNT NAME: CONNEXA\nPAY TO ACCOUNT NUMBER: —\nINSTRUCTIONS: Verification is currently unavailable.";
  const upgradeStatus: "none" | "pending" | "approved" | "rejected" =
    ownUpgrade.data?.status ?? "none";
  const upgradeReference = ownUpgrade.data?.reference ?? null;

  let enrichedPosts = posts || [];
  if (user && enrichedPosts.length > 0) {
    const postIds = enrichedPosts.map((p) => p.id);
    const [reactionsRes, savedRes] = await Promise.all([
      supabase.from("reactions").select("post_id, type").eq("user_id", user.id).in("post_id", postIds),
      supabase.from("saved_posts").select("post_id").eq("user_id", user.id).in("post_id", postIds),
    ]);
    const reactionMap = Object.fromEntries((reactionsRes.data || []).map((r) => [r.post_id, r.type]));
    const savedSet = new Set((savedRes.data || []).map((s) => s.post_id));
    enrichedPosts = await signPostMedia(supabase, await attachSharedPosts(supabase, enrichedPosts.map((p) => ({
      ...p,
      user_reaction: reactionMap[p.id] || null,
      is_saved: savedSet.has(p.id),
    }))));
  } else if (enrichedPosts.length > 0) {
    enrichedPosts = await signPostMedia(supabase, await attachSharedPosts(supabase, enrichedPosts));
  }

  return (
    <AppLayout>
      <ProfileClient
        profile={profile}
        currentProfile={currentProfile ?? null}
        isOwn={isOwn}
        isFriend={isFriend}
        isFollowing={isFollowing}
        isBlocked={isBlocked}
        friendRequestStatus={friendRequestStatus}
        friendRequestId={friendRequestId}
        followersCount={followersCount.count ?? 0}
        followingCount={followingCount.count ?? 0}
        friendsCount={friendsCount.count ?? 0}
        initialPosts={enrichedPosts as any}
        upgradeConfigText={upgradeConfigText}
        upgradeStatus={upgradeStatus}
        upgradeReference={upgradeReference}
      />
    </AppLayout>
  );
}
