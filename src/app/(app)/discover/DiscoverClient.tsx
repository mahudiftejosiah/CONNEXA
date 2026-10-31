"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Globe, TrendingUp, UserPlus, Newspaper, Radio, Gamepad2, Clapperboard, ArrowRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { PostCard } from "@/components/posts/PostCard";
import { sendFriendRequest } from "@/lib/actions/friends";
import type { Profile, PostWithAuthor, Group } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { pluralize } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";

interface NewsEntry {
  channel: string;
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

interface DiscoverClientProps {
  suggestedPeople: Profile[];
  publicGroups: (Group & { owner: Profile })[];
  trendingPosts: PostWithAuthor[];
  currentUserId: string;
  news: NewsEntry[];
}

export function DiscoverClient({ suggestedPeople, publicGroups, trendingPosts, currentUserId, news }: DiscoverClientProps) {
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  async function handleAddFriend(userId: string) {
    const res = await sendFriendRequest(userId);
    if (res.error) { toast.error(res.error); return; }
    setSentTo((p) => new Set(p).add(userId));
    toast.success("Friend request sent!");
  }

  return (
    <div className="space-y-8">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl p-6 sm:p-8 text-white"
        style={{ background: "linear-gradient(135deg, rgb(var(--a-900)), rgb(var(--a-700)) 55%, rgb(var(--b-600)))" }}>
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <h1 className="text-2xl sm:text-3xl font-extrabold relative z-10">What&apos;s happening around you</h1>
        <p className="text-sm sm:text-base opacity-80 mt-1 max-w-lg relative z-10">
          World news, live moments, trending posts and people you should know — all in one place.
        </p>
        <div className="flex flex-wrap gap-2 mt-5 relative z-10">
          <Link href="/live" className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            <Radio className="w-4 h-4" /> Go Live
          </Link>
          <Link href="/games" className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            <Gamepad2 className="w-4 h-4" /> Play games
          </Link>
          <Link href="/groups" className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            <Users className="w-4 h-4" /> Join a community
          </Link>
        </div>
      </div>

      {/* News */}
      {news.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <Newspaper className="w-5 h-5" style={{ color: "rgb(var(--a-800))" }} /> Latest news
            </h2>
            <span className="text-xs font-semibold px-2 py-1 rounded-full"
              style={{ backgroundColor: "rgb(var(--a-800) / 0.1)", color: "rgb(var(--a-800))" }}>
              BBC News
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:grid md:grid-cols-2 md:overflow-visible">
            {news.slice(0, 8).map((n) => (
              <a key={n.link} href={n.link} target="_blank" rel="noopener noreferrer"
                className="card p-4 min-w-[75%] sm:min-w-[45%] md:min-w-0 snap-start hover:shadow-md transition-shadow flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span className="font-bold uppercase tracking-wide" style={{ color: "rgb(var(--a-600))" }}>{n.channel}</span>
                  <span>·</span>
                  <span>{(() => { const d = new Date(n.pubDate); return isNaN(d.getTime()) ? "" : formatRelativeTime(d.toISOString()); })()}</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                </div>
                <p className="font-semibold text-sm leading-snug" style={{ color: "var(--text-primary)" }}>{n.title}</p>
                <p className="text-xs line-clamp-2" style={{ color: "var(--text-secondary)" }}>{n.description}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Go live banner */}
      <Link href="/live" className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow border-l-4 !border-l-red-500">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
          <Clapperboard className="w-6 h-6 text-red-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Share a live moment</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Go to your camera studio, record, and post it straight to your feed.</p>
        </div>
        <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-red-500 text-white flex-shrink-0">GO LIVE</span>
      </Link>

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
