import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { Search } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Metadata } from "next";

interface Props { searchParams: Promise<{ q?: string }> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `Search: ${q}` : "Search" };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = q?.trim() || "";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profiles: any[] = [];
  let posts: any[] = [];
  let groups: any[] = [];

  if (query.length >= 2) {
    const [profilesRes, groupsRes, postsRes] = await Promise.all([
      supabase.from("profiles").select("*")
        .eq("profile_visibility", "public")
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(10),
      supabase.from("groups").select("*, owner:profiles(*)")
        .eq("visibility", "public")
        .ilike("name", `%${query}%`)
        .limit(6),
      user ? supabase.from("posts").select("*, author:profiles(*), media:post_media(*)")
        .eq("visibility", "public")
        .ilike("content", `%${query}%`)
        .is("group_id", null)
        .limit(10) : { data: [] },
    ]);
    profiles = profilesRes.data || [];
    groups = groupsRes.data || [];
    posts = postsRes.data || [];
  }

  const total = profiles.length + groups.length + posts.length;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Search bar */}
        <form action="/search" method="GET">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
            <input type="search" name="q" defaultValue={query} placeholder="Search people, posts, groups…" autoFocus className="input pl-9" />
          </div>
        </form>

        {query.length < 2 ? (
          <EmptyState icon={<Search className="w-8 h-8" />} title="Search CONNEXA" description="Enter at least 2 characters to search people, posts, and groups." />
        ) : total === 0 ? (
          <EmptyState icon={<Search className="w-8 h-8" />} title={`No results for "${query}"`} description="Try a different search term." />
        ) : (
          <>
            {profiles.length > 0 && (
              <section>
                <h2 className="font-bold text-[var(--text-primary)] mb-3">People</h2>
                <div className="space-y-2">
                  {profiles.map((p) => (
                    <Link key={p.id} href={`/profile/${p.username}`} className="card p-3 flex items-center gap-3 hover:shadow-md transition-shadow">
                      <Avatar src={p.avatar_url} name={p.display_name} size={44} userId={p.id} />
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--text-primary)] truncate">{p.display_name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">@{p.username}</p>
                        {p.bio && <p className="text-xs text-[var(--text-secondary)] truncate">{p.bio}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {groups.length > 0 && (
              <section>
                <h2 className="font-bold text-[var(--text-primary)] mb-3">Groups</h2>
                <div className="space-y-2">
                  {groups.map((g) => (
                    <Link key={g.id} href={`/groups/${g.id}`} className="card p-3 flex items-center gap-3 hover:shadow-md transition-shadow">
                      <div className="w-11 h-11 rounded-xl bg-brand-green-800/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg font-bold text-brand-green-800 dark:text-brand-gold-400">{g.name[0]}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--text-primary)]">{g.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{g.member_count} members</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {posts.length > 0 && (
              <section>
                <h2 className="font-bold text-[var(--text-primary)] mb-3">Posts</h2>
                <div className="space-y-3">
                  {posts.map((p) => (
                    <div key={p.id} className="card p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Avatar src={p.author.avatar_url} name={p.author.display_name} size={32} userId={p.author.id} />
                        <Link href={`/profile/${p.author.username}`} className="text-sm font-semibold hover:underline">{p.author.display_name}</Link>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] line-clamp-3">{p.content}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
