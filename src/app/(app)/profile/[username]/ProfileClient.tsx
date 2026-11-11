"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MapPin, Link as LinkIcon, Calendar, UserPlus, UserMinus,
  UserCheck, MessageCircle, Bell, BellOff, Shield, Edit, Users,
  Camera, Radio,
} from "lucide-react";
import Image from "next/image";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { PostCard } from "@/components/posts/PostCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import { LiveViewer } from "@/components/live/LiveViewer";
import { createClient } from "@/lib/supabase/client";
import { clipUrl, isOpen } from "@/lib/live";
import {
  sendFriendRequest, acceptFriendRequest, cancelFriendRequest,
  removeFriend, toggleFollow, toggleBlock,
} from "@/lib/actions/friends";
import { formatJoinDate } from "@/lib/utils";
import { VerifiedTick } from "@/components/ui/VerifiedTick";
import { UpgradePanel, type UpgradeStatus } from "@/components/profile/UpgradePanel";
import type { LiveSession, Profile, PostWithAuthor } from "@/lib/supabase/types";
import toast from "react-hot-toast";

interface ProfileClientProps {
  profile: Profile;
  currentProfile: Profile | null;
  isOwn: boolean;
  isFriend: boolean;
  isFollowing: boolean;
  isBlocked: boolean;
  friendRequestStatus: "none" | "sent" | "received";
  friendRequestId: string | null;
  followersCount: number;
  followingCount: number;
  friendsCount: number;
  initialPosts: PostWithAuthor[];
  initialLive: LiveSession | null;
  upgradeConfigText: string;
  upgradeStatus: UpgradeStatus;
  upgradeReference: string | null;
}

export function ProfileClient({
  profile, currentProfile, isOwn,
  isFriend: initFriend, isFollowing: initFollowing, isBlocked: initBlocked,
  friendRequestStatus: initReqStatus, friendRequestId: initReqId,
  followersCount, followingCount, friendsCount, initialPosts, initialLive,
  upgradeConfigText, upgradeStatus, upgradeReference,
}: ProfileClientProps) {
  const [isFriend, setIsFriend] = useState(initFriend);
  const [isFollowing, setIsFollowing] = useState(initFollowing);
  const [isBlocked, setIsBlocked] = useState(initBlocked);
  const [reqStatus, setReqStatus] = useState(initReqStatus);
  const [reqId, setReqId] = useState(initReqId);
  const [loading, setLoading] = useState(false);
  const [confirmUnfriend, setConfirmUnfriend] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [activeTab, setActiveTab] = useState<"posts" | "about" | "upgrade">("posts");
  const [live, setLive] = useState<LiveSession | null>(initialLive);
  const [watching, setWatching] = useState(false);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // The cover belongs to the broadcast only while it is running, so the row is
  // followed here: the start puts the live picture over the photo, the end —
  // or a broadcaster who vanished — takes it away again by itself.
  useEffect(() => {
    let cancelled = false;
    async function read() {
      const { data } = await supabase
        .from("live_sessions")
        .select("*")
        .eq("user_id", profile.id)
        .eq("status", "live")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setLive(isOpen(data) ? data : null);
    }
    void read();
    // Realtime makes the cover flip the second the broadcast starts or stops;
    // the poll is there for the connections that never open.
    const channel = supabase
      .channel(`live-cover:${profile.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "live_sessions", filter: `user_id=eq.${profile.id}`,
      }, (payload) => {
        // Every clip upload rewrites this row, but only the start and the end
        // change what the cover has to show.
        const next = payload.new as LiveSession | undefined;
        const previous = payload.old as LiveSession | undefined;
        if (payload.eventType === "INSERT" || next?.status !== previous?.status) void read();
      })
      .subscribe();
    const poll = setInterval(() => void read(), 15000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [supabase, profile.id]);


  async function handleFriendAction() {
    setLoading(true);
    if (isFriend) {
      setLoading(false);
      setConfirmUnfriend(true);
      return;
    }
    if (reqStatus === "sent" && reqId) {
      const res = await cancelFriendRequest(reqId);
      if (res.error) toast.error(res.error);
      else { setReqStatus("none"); setReqId(null); toast.success("Request cancelled."); }
    } else if (reqStatus === "received" && reqId) {
      const res = await acceptFriendRequest(reqId);
      if (res.error) toast.error(res.error);
      else { setIsFriend(true); setReqStatus("none"); toast.success("Friend request accepted!"); }
    } else {
      const res = await sendFriendRequest(profile.id);
      if (res.error) toast.error(res.error);
      else { setReqStatus("sent"); toast.success("Friend request sent!"); }
    }
    setLoading(false);
  }

  async function handleUnfriend() {
    const res = await removeFriend(profile.id);
    if (res.error) toast.error(res.error);
    else { setIsFriend(false); setReqStatus("none"); toast.success("Removed from friends."); }
    setConfirmUnfriend(false);
  }

  async function handleFollow() {
    const res = await toggleFollow(profile.id);
    if (res.error) toast.error(res.error);
    else { setIsFollowing(res.following ?? false); toast.success(res.following ? "Now following!" : "Unfollowed."); }
  }

  async function handleBlock() {
    const res = await toggleBlock(profile.id);
    if (res.error) toast.error(res.error);
    else {
      setIsBlocked(res.blocked ?? false);
      if (res.blocked) { setIsFriend(false); setIsFollowing(false); }
      toast.success(res.blocked ? "User blocked." : "User unblocked.");
    }
    setConfirmBlock(false);
  }

  const friendBtnLabel = isFriend
    ? "Friends"
    : reqStatus === "sent"
    ? "Request sent"
    : reqStatus === "received"
    ? "Accept request"
    : "Add friend";

  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.display_name)}&size=200&background=12372A&color=D6B875`;

  return (
    <div className="space-y-4">
      {/* Cover + profile header card */}
      <div className="card overflow-hidden">
        {/* Cover */}
        <div className="relative h-48" style={{ background: "linear-gradient(135deg, rgb(var(--a-800)), rgb(var(--a-700)))" }}>
          {profile.cover_url && !live && (
            <Image src={profile.cover_url} alt="Cover photo" fill className="object-cover" sizes="100vw" priority />
          )}
          {/* While a broadcast runs it owns the cover, and gives the photo back
              on its own the moment the session ends. */}
          {live && (
            <button onClick={() => setWatching(true)} aria-label={`Watch ${profile.display_name} live`}
              className="absolute inset-0 overflow-hidden">
              {live.clip_path && (
                <video key={live.clip_path} src={clipUrl(supabase, live.clip_path)}
                  autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />
              )}
              <span className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full animate-pulse">
                <Radio className="w-3 h-3" /> LIVE
              </span>
              <span className="absolute bottom-3 left-3 max-w-[60%] truncate text-white text-xs font-semibold px-3 py-1.5 rounded-xl"
                style={{ background: "rgba(0,0,0,0.5)" }}>
                {live.title || "Live now"}
              </span>
              <span className="absolute bottom-3 right-3 text-white text-xs font-semibold px-3 py-1.5 rounded-xl"
                style={{ background: "rgba(0,0,0,0.5)" }}>
                Tap to watch
              </span>
            </button>
          )}
          {isOwn && !live && (
            <Link
              href="/settings/profile"
              className="absolute bottom-3 right-3 text-white text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors"
              style={{ background: "rgba(0,0,0,0.5)" }}
            >
              <Camera className="w-3.5 h-3.5" /> Edit cover
            </Link>
          )}
        </div>

        <div className="px-4 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-12">
            {/* Avatar */}
            <div className="relative w-fit">
              <div className="w-24 h-24 rounded-full border-4 overflow-hidden" style={{ borderColor: "var(--bg-card)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={profile.avatar_url || fallbackAvatar}
                  alt={profile.display_name}
                  width={96}
                  height={96}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.src = fallbackAvatar; }}
                />
              </div>
              {isOwn && (
                <Link
                  href="/settings/profile"
                  className="absolute bottom-1 right-1 w-7 h-7 rounded-full flex items-center justify-center text-white transition-colors"
                  style={{ background: "rgb(var(--a-800))" }}
                >
                  <Camera className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            {/* Action buttons */}
            {!isOwn && currentProfile && !isBlocked && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={isFriend ? "outline" : reqStatus === "received" ? "secondary" : "primary"}
                  size="sm"
                  icon={isFriend ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  loading={loading}
                  onClick={handleFriendAction}
                >
                  {friendBtnLabel}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={isFollowing ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                  onClick={handleFollow}
                >
                  {isFollowing ? "Unfollow" : "Follow"}
                </Button>
                <Link href={`/messages?with=${profile.id}`}>
                  <Button variant="ghost" size="sm" icon={<MessageCircle className="w-4 h-4" />}>
                    Message
                  </Button>
                </Link>
              </div>
            )}
            {!isOwn && currentProfile && isBlocked && (
              <Button variant="danger" size="sm" icon={<Shield className="w-4 h-4" />} onClick={() => setConfirmBlock(true)}>
                Unblock
              </Button>
            )}
            {isOwn && (
              <Link href="/settings/profile">
                <Button variant="outline" size="sm" icon={<Edit className="w-4 h-4" />}>Edit profile</Button>
              </Link>
            )}
          </div>

          {/* Name + info */}
          <div className="mt-4">
            <h1 className="text-xl font-extrabold flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
              {profile.display_name}
              {profile.is_verified && <VerifiedTick size={18} />}
            </h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>@{profile.username}</p>
            {profile.bio && (
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                {profile.bio}
              </p>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
              {profile.location && (
                <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <MapPin className="w-3.5 h-3.5" /> {profile.location}
                </span>
              )}
              {profile.website && (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs hover:underline"
                  style={{ color: "rgb(var(--a-800))" }}
                >
                  <LinkIcon className="w-3.5 h-3.5" /> {profile.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                <Calendar className="w-3.5 h-3.5" /> Joined {formatJoinDate(profile.created_at)}
              </span>
            </div>

            {profile.interests && profile.interests.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {profile.interests.map((i) => (
                  <span
                    key={i}
                    className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: "rgb(var(--a-800) / 0.1)", color: "rgb(var(--a-800))" }}
                  >
                    {i}
                  </span>
                ))}
              </div>
            )}

            {/* Stats */}
            <div className="flex gap-6 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              {[
                { label: "Friends",   value: friendsCount },
                { label: "Followers", value: followersCount },
                { label: "Following", value: followingCount },
              ].map((s) => (
                <div key={s.label}>
                  <span className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>
                    {s.value}
                  </span>
                  <span className="text-xs block" style={{ color: "var(--text-secondary)" }}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderTop: "1px solid var(--border)" }}>
          {([
            { id: "posts", label: "Posts" },
            { id: "about", label: "About" },
            ...(isOwn ? [{ id: "upgrade", label: "Upgrade account" }] : []),
          ] as { id: "posts" | "about" | "upgrade"; label: string }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeTab === tab.id ? "border-b-2 border-[rgb(var(--a-800))]" : ""
              }`}
              style={{
                color: activeTab === tab.id ? "rgb(var(--a-800))" : "var(--text-secondary)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Posts tab */}
      {activeTab === "posts" && (
        <div className="space-y-4">
          {initialPosts.length === 0 ? (
            <EmptyState
              icon={<Users className="w-8 h-8" />}
              title="No posts yet"
              description={isOwn ? "Share something with your network." : "Nothing to show here yet."}
            />
          ) : (
            initialPosts.map((post) => (
              <PostCard key={post.id} post={post} currentUserId={currentProfile?.id} />
            ))
          )}
        </div>
      )}

      {/* About tab */}
      {activeTab === "about" && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>About</h2>
          {profile.bio
            ? <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{profile.bio}</p>
            : <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No bio yet.</p>
          }
          {profile.location && (
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              <span className="font-medium">Location: </span>{profile.location}
            </p>
          )}
          {profile.website && (
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              <span className="font-medium">Website: </span>
              <a href={profile.website} className="hover:underline" style={{ color: "rgb(var(--a-800))" }} target="_blank" rel="noopener noreferrer">
                {profile.website}
              </a>
            </p>
          )}
          {profile.interests && profile.interests.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Interests</p>
              <div className="flex flex-wrap gap-2">
                {profile.interests.map((i) => (
                  <span
                    key={i}
                    className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{ background: "rgb(var(--a-800) / 0.1)", color: "rgb(var(--a-800))" }}
                  >
                    {i}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upgrade account tab (own profile only) */}
      {activeTab === "upgrade" && isOwn && (
        <UpgradePanel
          userId={profile.id}
          verified={profile.is_verified}
          initialStatus={upgradeStatus}
          initialReference={upgradeReference}
          configText={upgradeConfigText}
        />
      )}

      <ConfirmDialog
        open={confirmUnfriend}
        onClose={() => setConfirmUnfriend(false)}
        onConfirm={handleUnfriend}
        title="Remove friend"
        message={`Remove ${profile.display_name} from your friends?`}
        confirmLabel="Remove"
        danger
      />
      <ConfirmDialog
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={handleBlock}
        title={isBlocked ? "Unblock user" : "Block user"}
        message={isBlocked
          ? `Unblock ${profile.display_name}?`
          : `Block ${profile.display_name}? They won't be able to see your content.`}
        confirmLabel={isBlocked ? "Unblock" : "Block"}
        danger
      />

      {watching && live && (
        <LiveViewer
          session={live}
          authorName={profile.display_name}
          onClose={() => setWatching(false)}
        />
      )}
    </div>
  );
}
