"use client";

import { useState } from "react";
import Link from "next/link";
import { UserMinus, UserCheck, UserX, Users, Clock, Send } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  acceptFriendRequest, rejectFriendRequest, cancelFriendRequest, removeFriend,
} from "@/lib/actions/friends";
import type { Profile, FriendRequest, Friendship } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { ConfirmDialog } from "@/components/ui/Modal";

type FriendWithProfile = Friendship & { friend: Profile };
type SentRequest = FriendRequest & { receiver: Profile };
type ReceivedRequest = FriendRequest & { sender: Profile };

interface FriendsClientProps {
  friends: FriendWithProfile[];
  sentRequests: SentRequest[];
  receivedRequests: ReceivedRequest[];
  currentUserId: string;
}

type Tab = "friends" | "received" | "sent";

export function FriendsClient({ friends: initFriends, sentRequests: initSent, receivedRequests: initReceived, currentUserId }: FriendsClientProps) {
  const [tab, setTab] = useState<Tab>("received");
  const [friends, setFriends] = useState(initFriends);
  const [sent, setSent] = useState(initSent);
  const [received, setReceived] = useState(initReceived);
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const tabs = [
    { key: "received" as Tab, label: "Requests", count: received.length },
    { key: "friends" as Tab, label: "Friends", count: friends.length },
    { key: "sent" as Tab, label: "Sent", count: sent.length },
  ];

  async function handleAccept(req: ReceivedRequest) {
    setLoadingId(req.id);
    const res = await acceptFriendRequest(req.id);
    setLoadingId(null);
    if (res.error) { toast.error(res.error); return; }
    setReceived((p) => p.filter((r) => r.id !== req.id));
    toast.success(`You and ${req.sender.display_name} are now friends!`);
  }

  async function handleReject(req: ReceivedRequest) {
    setLoadingId(req.id);
    const res = await rejectFriendRequest(req.id);
    setLoadingId(null);
    if (res.error) { toast.error(res.error); return; }
    setReceived((p) => p.filter((r) => r.id !== req.id));
    toast.success("Request declined.");
  }

  async function handleCancel(req: SentRequest) {
    setLoadingId(req.id);
    const res = await cancelFriendRequest(req.id);
    setLoadingId(null);
    if (res.error) { toast.error(res.error); return; }
    setSent((p) => p.filter((r) => r.id !== req.id));
    toast.success("Request cancelled.");
  }

  async function handleRemove(friendId: string) {
    const res = await removeFriend(friendId);
    if (res.error) { toast.error(res.error); return; }
    setFriends((p) => p.filter((f) => f.friend_id !== friendId));
    setConfirmRemove(null);
    toast.success("Friend removed.");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Friends</h1>

      {/* Tabs */}
      <div className="card flex overflow-hidden">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              tab === t.key
                ? "text-brand-green-800 dark:text-brand-gold-400 border-b-2 border-brand-green-800 dark:border-brand-gold-400"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="badge text-[10px] min-w-[1.1rem] h-[1.1rem]">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Received requests */}
      {tab === "received" && (
        received.length === 0 ? (
          <EmptyState icon={<Users className="w-8 h-8" />} title="No pending requests" description="When someone sends you a friend request, it will appear here." />
        ) : (
          <div className="space-y-3">
            {received.map((req) => (
              <div key={req.id} className="card p-4 flex items-center gap-3">
                <Link href={`/profile/${req.sender.username}`}>
                  <Avatar src={req.sender.avatar_url} name={req.sender.display_name} size={48} userId={req.sender.id} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${req.sender.username}`} className="font-semibold text-[var(--text-primary)] hover:underline block truncate">
                    {req.sender.display_name}
                  </Link>
                  <p className="text-xs text-[var(--text-secondary)]">@{req.sender.username}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" variant="primary" loading={loadingId === req.id} onClick={() => handleAccept(req)} icon={<UserCheck className="w-3.5 h-3.5" />}>
                    Accept
                  </Button>
                  <Button size="sm" variant="ghost" loading={loadingId === req.id} onClick={() => handleReject(req)} icon={<UserX className="w-3.5 h-3.5" />}>
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Friends list */}
      {tab === "friends" && (
        friends.length === 0 ? (
          <EmptyState icon={<Users className="w-8 h-8" />} title="No friends yet" description="Discover people and send friend requests to build your network." action={<Link href="/discover" className="btn-primary">Discover people</Link>} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {friends.map((f) => (
              <div key={f.friend_id} className="card p-4 flex items-center gap-3">
                <Link href={`/profile/${f.friend.username}`}>
                  <Avatar src={f.friend.avatar_url} name={f.friend.display_name} size={48} userId={f.friend.id} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${f.friend.username}`} className="font-semibold text-[var(--text-primary)] hover:underline block truncate">
                    {f.friend.display_name}
                  </Link>
                  <p className="text-xs text-[var(--text-secondary)] truncate">@{f.friend.username}</p>
                </div>
                <button
                  onClick={() => setConfirmRemove({ id: f.friend_id, name: f.friend.display_name })}
                  className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  aria-label="Remove friend"
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Sent requests */}
      {tab === "sent" && (
        sent.length === 0 ? (
          <EmptyState icon={<Send className="w-8 h-8" />} title="No sent requests" description="Requests you send will appear here until they're accepted or declined." />
        ) : (
          <div className="space-y-3">
            {sent.map((req) => (
              <div key={req.id} className="card p-4 flex items-center gap-3">
                <Link href={`/profile/${req.receiver.username}`}>
                  <Avatar src={req.receiver.avatar_url} name={req.receiver.display_name} size={48} userId={req.receiver.id} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${req.receiver.username}`} className="font-semibold hover:underline block truncate">{req.receiver.display_name}</Link>
                  <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</p>
                </div>
                <Button size="sm" variant="ghost" loading={loadingId === req.id} onClick={() => handleCancel(req)}>
                  Cancel
                </Button>
              </div>
            ))}
          </div>
        )
      )}

      <ConfirmDialog
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => confirmRemove && handleRemove(confirmRemove.id)}
        title="Remove friend"
        message={`Remove ${confirmRemove?.name} from your friends list?`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
