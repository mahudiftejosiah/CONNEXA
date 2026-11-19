"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { UserPlus, UserCheck, UserX } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { AccountBadge } from "@/components/ui/ProBadge";
import { createClient } from "@/lib/supabase/client";
import { removeFriend, sendFriendRequest, toggleFollow } from "@/lib/actions/friends";
import toast from "react-hot-toast";

export type PeopleKind = "friends" | "followers" | "following";

export type PersonRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean | null;
  pro_expires_at: string | null;
};

interface PeopleListModalProps {
  open: boolean;
  onClose: () => void;
  profileId: string;
  kind: PeopleKind | null;
  currentUserId: string;
  // Lets the profile header keep its numbers honest after an action here.
  onMutate?: (kind: Exclude<PeopleKind, null>, delta: number) => void;
}

const PAGE = 200;

export function PeopleListModal({ open, onClose, profileId, kind, currentUserId, onMutate }: PeopleListModalProps) {
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [done, setDone] = useState(true);
  const [myFriends, setMyFriends] = useState<Set<string>>(new Set());
  const [myFollowing, setMyFollowing] = useState<Set<string>>(new Set());
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const isOwnList = profileId === currentUserId;

  const load = useCallback(async (nextPage: number, replace: boolean) => {
    if (!kind) return;
    setLoading(true);
    const supabase = createClient();
    if (kind === "friends") {
      const { data, error } = await supabase.rpc("profile_friend_ids", {
        p_profile_id: profileId, p_limit: PAGE, p_offset: nextPage * PAGE,
      });
      setLoading(false);
      if (error) {
        toast.error("Could not load the friends list. Has migration 037 been applied?");
        return;
      }
      const rows = (data || []) as unknown as PersonRow[];
      setPeople((p) => (replace ? rows : [...p, ...rows]));
      setDone(rows.length < PAGE);
      return;
    }
    const column = kind === "followers" ? "follower_id" : "following_id";
    const filterColumn = kind === "followers" ? "following_id" : "follower_id";
    const { data: links, error } = await supabase
      .from("followers")
      .select(`${column}, created_at`)
      .eq(filterColumn, profileId)
      .order("created_at", { ascending: false })
      .range(nextPage * PAGE, (nextPage + 1) * PAGE - 1);
    if (error) {
      setLoading(false);
      toast.error("Could not load that list.");
      return;
    }
    const ids = (links || []).map((l: Record<string, string>) => l[column]).filter(Boolean);
    if (ids.length === 0) {
      setLoading(false);
      if (replace) setPeople([]);
      setDone(true);
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, is_verified, pro_expires_at")
      .in("id", ids);
    const byId = new Map((profiles || []).map((p) => [p.id, p]));
    // Preserve the newest-first order the links arrived in.
    const rows = ids.map((id) => byId.get(id)).filter(Boolean) as PersonRow[];
    setLoading(false);
    setPeople((p) => (replace ? rows : [...p, ...rows]));
    setDone(rows.length < PAGE);
  }, [kind, profileId]);

  useEffect(() => {
    if (!open || !kind) return;
    setPeople([]);
    setPage(0);
    setDone(true);
    void load(0, true);
    const supabase = createClient();
    void (async () => {
      const [friendsRes, followingRes] = await Promise.all([
        supabase.from("friendships").select("friend_id").eq("user_id", currentUserId),
        supabase.from("followers").select("following_id").eq("follower_id", currentUserId),
      ]);
      setMyFriends(new Set((friendsRes.data || []).map((r) => r.friend_id)));
      setMyFollowing(new Set((followingRes.data || []).map((r) => r.following_id)));
    })();
  }, [open, kind, profileId, currentUserId, load]);

  async function unfriend(personId: string) {
    setBusyId(personId);
    const res = await removeFriend(personId);
    setBusyId(null);
    if (res.error) { toast.error(res.error); return; }
    setPeople((p) => p.filter((x) => x.id !== personId));
    onMutate?.("friends", -1);
    toast.success("Removed from friends.");
  }

  async function addFriend(personId: string) {
    setBusyId(personId);
    const res = await sendFriendRequest(personId);
    setBusyId(null);
    if (res.error) { toast.error(res.error); return; }
    setRequested((p) => new Set(p).add(personId));
    toast.success("Friend request sent!");
  }

  async function follow(personId: string) {
    setBusyId(personId);
    const res = await toggleFollow(personId);
    setBusyId(null);
    if (res.error) { toast.error(res.error); return; }
    if (res.following) {
      setMyFollowing((p) => new Set(p).add(personId));
      toast.success("Now following!");
    } else {
      setMyFollowing((p) => {
        const next = new Set(p);
        next.delete(personId);
        return next;
      });
      toast.success("Unfollowed.");
      if (kind === "following" && isOwnList) {
        setPeople((p) => p.filter((x) => x.id !== personId));
        onMutate?.("following", -1);
      }
    }
  }

  const title = kind === "friends" ? "Friends" : kind === "followers" ? "Followers" : "Following";

  function action(row: PersonRow) {
    if (row.id === currentUserId) {
      return <span className="text-xs font-medium px-2 py-1 rounded-lg" style={{ color: "var(--text-secondary)", backgroundColor: "var(--border)" }}>You</span>;
    }
    if (busyId === row.id) {
      return <Button variant="ghost" size="sm" loading />;
    }
    if (kind === "friends") {
      if (myFriends.has(row.id)) {
        return isOwnList ? (
          <Button variant="outline" size="sm" onClick={() => void unfriend(row.id)}>
            <UserX className="w-3.5 h-3.5" /> Unfriend
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg" style={{ color: "rgb(var(--a-600))" }}>
            <UserCheck className="w-3.5 h-3.5" /> Friends
          </span>
        );
      }
      return requested.has(row.id) || isOwnList ? (
        <span className="text-xs font-medium px-2 py-1 rounded-lg" style={{ color: "var(--text-secondary)" }}>
          {requested.has(row.id) ? "Request sent" : ""}
        </span>
      ) : (
        <Button variant="primary" size="sm" onClick={() => void addFriend(row.id)}>
          <UserPlus className="w-3.5 h-3.5" /> Add
        </Button>
      );
    }
    return myFollowing.has(row.id) ? (
      <Button variant="outline" size="sm" onClick={() => void follow(row.id)}>Following</Button>
    ) : (
      <Button variant="secondary" size="sm" onClick={() => void follow(row.id)}>
        <UserPlus className="w-3.5 h-3.5" /> Follow
      </Button>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <div className="max-h-[60vh] overflow-y-auto divide-y" style={{ borderColor: "var(--border)" }}>
        {loading && people.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>Loading…</p>
        )}
        {!loading && people.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            Nobody here yet.
          </p>
        )}
        {people.map((row) => (
          <div key={row.id} className="flex items-center gap-3 py-2.5">
            <Link href={`/profile/${row.username}`} onClick={onClose} className="flex-shrink-0">
              <Avatar src={row.avatar_url} name={row.display_name} size={44} userId={row.id} />
            </Link>
            <Link href={`/profile/${row.username}`} onClick={onClose} className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                {row.display_name}
                <AccountBadge account={row} />
              </p>
              <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>@{row.username}</p>
            </Link>
            {action(row)}
          </div>
        ))}
        {!done && (
          <div className="py-3 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              loading={loading}
              onClick={() => { const next = page + 1; setPage(next); void load(next, false); }}
            >
              Load more
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
