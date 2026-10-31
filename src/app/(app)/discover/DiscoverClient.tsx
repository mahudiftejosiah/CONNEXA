"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Globe, TrendingUp, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { PostCard } from "@/components/posts/PostCard";
import { sendFriendRequest } from "@/lib/actions/friends";
import type { Profile, PostWithAuthor, Group } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { pluralize } from "@/lib/utils";

interface DiscoverClientProps {
  suggestedPeople: Profile[];
  publicGroups: (Group & { owner: Profile })[];
  trendingPosts: PostWithAuthor[];
  currentUserId: string;
}

export function DiscoverClient({ suggestedPeople, publicGroups, trendingPosts, currentUserId }: DiscoverClientProps) {
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  async function handleAddFriend(userId: string) {
    const res = await sendFriendRequest(userId);
    if (res.error) { toast.error(res.error); return; }
    setSentTo((p) => new Set(p).add(userId));
    toast.success("Friend request sent!");
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>Discover</h1>

      {/* Suggested people */}
      {suggestedPeople.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Users className="w-5 h-5" style={{ color: "rgb(var(--a-800))" }} /> People you may know
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suggestedPeople.map((person) => (
              <div key={person.id} className="card p-4 flex items-center gap-3">
                <Link href={`/profile/${person.username}`}>
                  <Avatar src={person.avatar_url} name={person.display_name} size={48} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/profile/${person.username}`}
                    className="font-semibold text-sm hover:underline block truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {person.display_name}
                  </Link>
                  <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                    @{person.username}
                  </p>
                  {person.bio && (
                    <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {person.bio}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={sentTo.has(person.id) ? "ghost" : "primary"}
                  icon={<UserPlus className="w-3.5 h-3.5" />}
                  onClick={() => !sentTo.has(person.id) && handleAddFriend(person.id)}
                  disabled={sentTo.has(person.id)}
                >
                  {sentTo.has(person.id) ? "Sent" : "Add"}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Public groups */}
      {publicGroups.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <Globe className="w-5 h-5" style={{ color: "rgb(var(--a-800))" }} /> Public communities
            </h2>
            <Link href="/groups" className="text-sm hover:underline" style={{ color: "rgb(var(--a-800))" }}>See all</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {publicGroups.slice(0, 4).map((g) => (
              <Link key={g.id} href={`/groups/${g.id}`} className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
                  style={{ background: "rgb(var(--a-800) / 0.1)" }}>
                  {g.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.image_url} alt={g.name} className="w-full h-full object-cover" />
                  ) : (
                    <Users className="w-6 h-6" style={{ color: "rgb(var(--a-800))" }} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>{g.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {pluralize(g.member_count, "member")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Trending posts */}
      {trendingPosts.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <TrendingUp className="w-5 h-5" style={{ color: "rgb(var(--a-800))" }} /> Trending posts
          </h2>
          <div className="space-y-4">
            {trendingPosts.map((post) => (
              <PostCard key={post.id} post={post} currentUserId={currentUserId} />
            ))}
          </div>
        </section>
      )}

      {suggestedPeople.length === 0 && publicGroups.length === 0 && trendingPosts.length === 0 && (
        <div className="text-center py-16">
          <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Nothing to discover yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            As more people join CONNEXA, suggested content will appear here.
          </p>
        </div>
      )}
    </div>
  );
}
