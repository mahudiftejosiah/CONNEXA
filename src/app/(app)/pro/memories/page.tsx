import Link from "next/link";
import { redirect } from "next/navigation";
import { History, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signPostMedia } from "@/lib/media";
import { attachSharedPosts } from "@/lib/shared-posts";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProFrame } from "@/components/pro/ProFrame";
import { PostCard } from "@/components/posts/PostCard";
import { getProStatus } from "@/lib/pro";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Memories" };

const WINDOWS = [
  { label: "This day last week", months: 0, days: 7 },
  { label: "One month ago", months: 1, days: 0 },
  { label: "Three months ago", months: 3, days: 0 },
  { label: "A year ago", months: 12, days: 0 },
] as const;

function dayWindow(months: number, days: number) {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  if (months) from.setMonth(from.getMonth() - months);
  if (days) from.setDate(from.getDate() - days);
  const end = new Date(from);
  end.setDate(end.getDate() + 1);
  return { from: from.toISOString(), to: end.toISOString() };
}

export default async function MemoriesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const status = await getProStatus(supabase, user.id);

  const groups: { label: string; posts: Record<string, unknown>[] }[] = [];

  if (status.pro) {
    for (const w of WINDOWS) {
      const { from, to } = dayWindow(w.months, w.days);
      const { data } = await supabase.from("posts")
        .select(`*, author:profiles(*), media:post_media(*)`)
        .eq("author_id", user.id)
        .is("group_id", null)
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: false })
        .limit(10);
      const posts = await signPostMedia(supabase, await attachSharedPosts(supabase, data ?? []));
      if (posts.length > 0) groups.push({ label: w.label, posts });
    }
  }

  if (!status.pro) {
    return (
      <AppLayout>
        <ProFrame title="Memories" pro={false} expiresAt={status.expiresAt}
          subtitle="The posts you wrote on this day, weeks and years ago.">
          <div className="card p-6 space-y-3 text-center">
            <Lock className="w-8 h-8 mx-auto" style={{ color: "var(--brand-gold)" }} />
            <p className="font-bold" style={{ color: "var(--text-primary)" }}>Memories is a PRO feature</p>
            <p className="text-sm max-w-md mx-auto" style={{ color: "var(--text-secondary)" }}>
              It only ever reads your own posts, matched to the calendar day. No other person&apos;s content appears here.
            </p>
            <Link href="/pro#upgrade" className="btn-primary text-sm inline-flex mx-auto"
              style={{ background: "var(--brand-gold)", color: "var(--brand-green)" }}>
              Upgrade to PRO
            </Link>
          </div>
        </ProFrame>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <ProFrame title="Memories" pro={status.pro} expiresAt={status.expiresAt}
        subtitle="Your own posts, pulled back to the day you wrote them.">
        {groups.length === 0 ? (
          <div className="card p-8 text-center space-y-2">
            <History className="w-8 h-8 mx-auto" style={{ color: "var(--text-secondary)" }} />
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Nothing to look back on yet</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Memories fill in as the days pass. Last week, a month, three months and a year are the windows CONNEXA checks.
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.label} className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
                style={{ color: "var(--brand-gold)" }}>
                <History className="w-3.5 h-3.5" />{g.label}
              </h2>
              {g.posts.map((p) => (
                <PostCard key={(p as { id: string }).id} post={p as never} currentUserId={user.id} />
              ))}
            </section>
          ))
        )}
      </ProFrame>
    </AppLayout>
  );
}
