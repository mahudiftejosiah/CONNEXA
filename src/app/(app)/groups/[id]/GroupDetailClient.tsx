"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Globe, Lock, UserMinus, Settings } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { CreatePost } from "@/components/posts/CreatePost";
import { PostCard } from "@/components/posts/PostCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/client";
import type { Group, GroupMembership, PostWithAuthor, Profile } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { pluralize } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface GroupDetailClientProps {
  group: Group & { owner: Profile };
  membership: GroupMembership | null;
  posts: PostWithAuthor[];
  members: (GroupMembership & { profile: Profile })[];
  currentUserId: string;
}

export function GroupDetailClient({ group, membership: initMembership, posts, members, currentUserId }: GroupDetailClientProps) {
  const router = useRouter();
  const [membership, setMembership] = useState(initMembership);
  const [loading, setLoading] = useState(false);
  const isOwner = group.owner_id === currentUserId;
  const isAdmin = membership?.role === "owner" || membership?.role === "admin";

  async function handleJoin() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("group_memberships").insert({ group_id: group.id, user_id: currentUserId, role: "member" });
    setLoading(false);
    if (error) { toast.error("Could not join."); return; }
    const { data } = await supabase.from("group_memberships").select("*").eq("group_id", group.id).eq("user_id", currentUserId).single();
    setMembership(data);
    toast.success("Joined group!");
    router.refresh();
  }

  async function handleLeave() {
    if (isOwner) { toast.error("Transfer ownership before leaving."); return; }
    setLoading(true);
    const supabase = createClient();
    await supabase.from("group_memberships").delete().eq("group_id", group.id).eq("user_id", currentUserId);
    setLoading(false);
    setMembership(null);
    toast.success("Left group.");
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card overflow-hidden">
        <div className="h-32 relative" style={{ background: "linear-gradient(135deg, rgb(var(--a-800)), rgb(var(--a-700)))" }}>
          {group.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={group.image_url} alt={group.name} className="w-full h-full object-cover absolute inset-0" />
          )}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden -mt-10 border-4" style={{ borderColor: "var(--bg-card)", background: "rgb(var(--a-800) / 0.1)" }}>
                {group.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={group.image_url} alt={group.name} className="w-full h-full object-cover" />
                ) : (
                  <Users className="w-7 h-7" style={{ color: "rgb(var(--a-800))" }} />
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-1">
              {membership ? (
                <Button size="sm" variant="ghost" icon={<UserMinus className="w-3.5 h-3.5" />} loading={loading} onClick={handleLeave}>
                  Leave
                </Button>
              ) : group.visibility === "public" ? (
                <Button size="sm" loading={loading} onClick={handleJoin}>Join group</Button>
              ) : null}
              {isAdmin && <Button size="sm" variant="outline" icon={<Settings className="w-3.5 h-3.5" />}>Manage</Button>}
            </div>
          </div>
          <h1 className="text-xl font-extrabold text-[var(--text-primary)] mt-2">{group.name}</h1>
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] mt-1">
            {group.visibility === "private" ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
            <span className="capitalize">{group.visibility}</span>
            <span>·</span>
            <span>{pluralize(group.member_count, "member")}</span>
          </div>
          {group.description && <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">{group.description}</p>}

          {/* Members preview */}
          {members.length > 0 && (
            <div className="flex items-center gap-1 mt-3">
              {members.slice(0, 5).map((m) => (
                <Link key={m.user_id} href={`/profile/${m.profile.username}`}>
                  <Avatar src={m.profile.avatar_url} name={m.profile.display_name} size={28} className="-ml-1 first:ml-0 border-2 border-[var(--bg-card)]" userId={m.profile.id} />
                </Link>
              ))}
              {group.member_count > 5 && (
                <span className="text-xs text-[var(--text-secondary)] ml-2">+{group.member_count - 5} more</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Posts */}
      {membership && (
        <CreatePost
          profile={{
            id: currentUserId,
            display_name: "You",
            avatar_url: null,
            username: "",
            cover_url: null,
            bio: null,
            interests: null,
            website: null,
            location: null,
            is_admin: false,
            is_verified: false,
            profile_visibility: "public",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }}
          groupId={group.id}
          onCreated={() => router.refresh()}
        />
      )}

      {posts.length === 0 ? (
        <EmptyState icon={<Users className="w-8 h-8" />} title="No posts yet" description={membership ? "Be the first to post in this group!" : "Join the group to see and create posts."} />
      ) : (
        posts.map((post) => (
          <PostCard key={post.id} post={post} currentUserId={currentUserId} />
        ))
      )}
    </div>
  );
}
