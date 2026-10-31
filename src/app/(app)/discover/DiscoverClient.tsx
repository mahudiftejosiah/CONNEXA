"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Globe, TrendingUp, UserPlus, Newspaper, Radio, Gamepad2, Clapperboard, ArrowRight, GraduationCap, ExternalLink, Plus, Trash2, Library, Play } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { PostCard } from "@/components/posts/PostCard";
import { sendFriendRequest } from "@/lib/actions/friends";
import { createClient } from "@/lib/supabase/client";
import type { Profile, PostWithAuthor, Group, SiteShortcut, StudyBook } from "@/lib/supabase/types";
import { SiteIconGrid } from "@/components/ui/SiteIconGrid";
import type { PoolReel } from "@/lib/reel-pool";
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

interface StudyCard {
  id: string;
  title: string;
  url: string;
  cover_url: string | null;
  description: string | null;
  created_at: string;
  added_by: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
}

interface DiscoverClientProps {
  suggestedPeople: Profile[];
  publicGroups: (Group & { owner: Profile })[];
  trendingPosts: PostWithAuthor[];
  currentUserId: string;
  news: NewsEntry[];
  studyResources: StudyCard[];
  studySites: SiteShortcut[];
  studyBooks: StudyBook[];
  watchReels: PoolReel[];
}

export function DiscoverClient({ suggestedPeople, publicGroups, trendingPosts, currentUserId, news, studyResources, studySites, studyBooks, watchReels }: DiscoverClientProps) {
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"for-you" | "study">("for-you");

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

      {/* Tabs */}
      <div className="flex gap-2 -mt-3">
        <button
          onClick={() => setTab("for-you")}
          className={"px-4 py-2 rounded-xl text-sm font-semibold border transition-colors " + (tab === "for-you" ? "text-white" : "hover:opacity-80")}
          style={tab === "for-you"
            ? { backgroundColor: "rgb(var(--a-800))", borderColor: "rgb(var(--a-800))" }
            : { backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          For you
        </button>
        <button
          onClick={() => setTab("study")}
          className={"inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors " + (tab === "study" ? "text-white" : "hover:opacity-80")}
          style={tab === "study"
            ? { backgroundColor: "rgb(var(--a-800))", borderColor: "rgb(var(--a-800))" }
            : { backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          <GraduationCap className="w-4 h-4" /> Study Room
        </button>
      </div>

      {tab === "for-you" && (
        <>

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

      {/* Watch — a fresh online reel mix on every refresh */}
      {watchReels.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <Clapperboard className="w-5 h-5" style={{ color: "rgb(var(--a-800))" }} /> Watch
            </h2>
            <Link href="/feed?tab=reels" className="text-sm hover:underline" style={{ color: "rgb(var(--a-800))" }}>Open Reels</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {watchReels.slice(0, 8).map((r) => (
              <Link key={`${r.platform}-${r.external_id}`} href="/feed?tab=reels"
                className="rounded-2xl overflow-hidden border transition-transform hover:scale-[1.02]"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                <div className="relative h-40 bg-black">
                  {r.platform === "youtube" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`https://img.youtube.com/vi/${r.external_id}/hqdefault.jpg`} alt={r.caption}
                      loading="lazy" className="h-full w-full object-cover opacity-90" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-black via-[#10151f] to-black">
                      <Clapperboard className="w-8 h-8 text-white/40" />
                    </div>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                      <Play className="w-5 h-5 text-white fill-white" />
                    </span>
                  </span>
                  <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-black/60 text-white">
                    {r.platform === "tiktok" ? "TikTok" : "YouTube"}
                  </span>
                </div>
                <p className="text-xs p-2.5 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{r.caption}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

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

        </>
      )}

      {tab === "study" && <StudyRoom initial={studyResources} currentUserId={currentUserId} sites={studySites} books={studyBooks} />}
    </div>
  );
}

const inputCls = "w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10";
const inputStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;

function StudyRoom({ initial, currentUserId, sites, books }: { initial: StudyCard[]; currentUserId: string; sites: SiteShortcut[]; books: StudyBook[] }) {
  const [items, setItems] = useState(initial);
  const [showSites, setShowSites] = useState(false);
  const [cat, setCat] = useState<"all" | StudyBook["category"]>("all");
  const shownBooks = cat === "all" ? books : books.filter((b) => b.category === cat);
  const [form, setForm] = useState({ title: "", url: "", cover_url: "", description: "" });
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!form.title.trim() || !/^https?:\/\//.test(form.url.trim())) {
      toast.error("A title and a valid http(s) link are required.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.from("study_resources").insert({
      title: form.title.trim(),
      url: form.url.trim(),
      cover_url: form.cover_url.trim() || null,
      description: form.description.trim() || null,
      added_by: currentUserId,
    }).select().single();
    setSaving(false);
    if (error || !data) { toast.error("Could not add resource: " + (error?.message || "")); return; }
    setItems((p) => [{ ...data, added_by: null } as unknown as StudyCard, ...p]);
    setForm({ title: "", url: "", cover_url: "", description: "" });
    toast.success("Added to the Study Room!");
  }

  async function remove(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("study_resources").delete().eq("id", id);
    if (error) { toast.error("Delete failed."); return; }
    setItems((p) => p.filter((x) => x.id !== id));
    toast.success("Resource removed.");
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <GraduationCap className="w-6 h-6" style={{ color: "rgb(var(--a-800))" }} />
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Study Room</h2>
        <button
          onClick={() => setShowSites((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors"
          style={showSites
            ? { backgroundColor: "rgb(var(--a-800))", borderColor: "rgb(var(--a-800))", color: "#fff" }
            : { backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          <Globe className="w-4 h-4" /> Visit sites
        </button>
      </div>

      {showSites && (
        sites.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No study sites yet — an admin can add them under Admin → Sites.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Learning sites</p>
            <SiteIconGrid items={sites} />
          </div>
        )
      )}

      {/* Book categories */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: "all", label: "All books" },
          { key: "educational", label: "Educational" },
          { key: "story", label: "Story books" },
          { key: "inspirational", label: "Inspirational" },
          { key: "holy", label: "Holy books" },
        ] as { key: "all" | StudyBook["category"]; label: string }[]).map((c) => {
          const n = c.key === "all" ? books.length : books.filter((b) => b.category === c.key).length;
          return (
            <button key={c.key} onClick={() => setCat(c.key)}
              className={"px-3 py-1.5 rounded-xl text-sm font-semibold border transition-colors " + (cat === c.key ? "text-white" : "hover:opacity-80")}
              style={cat === c.key
                ? { backgroundColor: "rgb(var(--a-800))", borderColor: "rgb(var(--a-800))" }
                : { backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              {c.label}
              <span className="ml-1.5 text-xs opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {shownBooks.length === 0 ? (
        <div className="card p-6 text-center">
          <Library className="w-7 h-7 mx-auto mb-2" style={{ color: "var(--text-secondary)" }} />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {books.length === 0
              ? "The book library loads once migration 013 and the book list are applied."
              : "No books in this category yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {shownBooks.map((b) => (
            <a key={b.id} href={b.pdf_url} target="_blank" rel="noopener noreferrer"
              className="rounded-2xl border overflow-hidden transition-transform hover:scale-[1.02]"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
              <div className="h-24 flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,rgb(var(--a-800)),rgb(var(--b-500)))" }}>
                <Library className="w-8 h-8 text-white/80" />
              </div>
              <div className="p-3">
                <p className="text-sm font-bold leading-tight line-clamp-2" style={{ color: "var(--text-primary)" }}>{b.title}</p>
                {b.author && <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>{b.author}</p>}
                <p className="text-[11px] mt-1.5 font-semibold uppercase tracking-wide" style={{ color: "rgb(var(--a-800))" }}>Read free</p>
              </div>
            </a>
          ))}
        </div>
      )}
      <p className="text-sm -mt-2" style={{ color: "var(--text-secondary)" }}>
        Shared learning links. Drop a link, add a thumbnail to represent it, and everyone in CONNEXA can open it.
      </p>

      {/* Add form */}
      <div className="card p-4 space-y-3">
        <p className="font-semibold text-sm flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
          <Plus className="w-4 h-4" style={{ color: "rgb(var(--a-800))" }} /> Add a resource
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          <input className={inputCls} style={inputStyle} placeholder="Title (e.g. WAEC past questions)"
            value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <input className={inputCls} style={inputStyle} placeholder="https://link-to-the-resource"
            value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
          <input className={inputCls} style={inputStyle} placeholder="Thumbnail image URL (optional)"
            value={form.cover_url} onChange={(e) => setForm((f) => ({ ...f, cover_url: e.target.value }))} />
          <input className={inputCls} style={inputStyle} placeholder="Short description (optional)"
            value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={add} disabled={saving} icon={<Plus className="w-3.5 h-3.5" />}>
            {saving ? "Adding…" : "Add to Study Room"}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card p-8 text-center">
          <Library className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-secondary)" }} />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No study links yet — be the first to add one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((g) => (
            <div key={g.id} className="rounded-2xl border overflow-hidden transition-transform hover:scale-[1.02] relative"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
              <a href={g.url} target="_blank" rel="noopener noreferrer" className="block">
                {g.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.cover_url} alt={g.title} className="w-full h-28 object-cover" />
                ) : (
                  <div className="w-full h-28 flex items-center justify-center" style={{ backgroundColor: "var(--border)" }}>
                    <GraduationCap className="w-8 h-8" style={{ color: "var(--text-secondary)" }} />
                  </div>
                )}
                <div className="p-3">
                  <p className="font-bold text-sm flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                    <span className="flex-1 truncate">{g.title}</span>
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-secondary)" }} />
                  </p>
                  {g.description && (
                    <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{g.description}</p>
                  )}
                  <p className="text-[11px] mt-1.5" style={{ color: "var(--text-secondary)" }}>
                    {g.added_by ? `added by ${g.added_by.display_name}` : "Study Room pick"}
                  </p>
                </div>
              </a>
              {(g.added_by?.id === currentUserId) && (
                <button onClick={() => remove(g.id)} aria-label="Remove resource"
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
