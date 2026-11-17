import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, MessageCircle, Package, Heart, Trophy, Award } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProFrame } from "@/components/pro/ProFrame";
import { LockedFeaturePreview } from "@/components/pro/LockedFeaturePreview";
import { growthLabel } from "@/lib/pro-analytics";
import { proAnalytics } from "@/lib/pro-analytics";
import { getProStatus } from "@/lib/pro";
import { compactCount } from "@/lib/utils";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Creator Dashboard" };

export default async function CreatorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const status = await getProStatus(supabase, user.id);

  if (!status.pro) {
    const previewTiles = [
      { label: "Post views (30d)" },
      { label: "Profile visits (30d)" },
      { label: "Reactions (30d)" },
      { label: "Comments (30d)" },
    ];
    const previewShortcuts = [
      { label: "Events hosted", icon: <CalendarDays className="w-4 h-4" /> },
      { label: "Listings live", icon: <Package className="w-4 h-4" /> },
      { label: "Quiz answers right", icon: <Trophy className="w-4 h-4" /> },
      { label: "Badges earned", icon: <Award className="w-4 h-4" /> },
    ];
    return (
      <AppLayout>
        <ProFrame title="Creator Dashboard" pro={false} expiresAt={status.expiresAt}
          subtitle="One screen for everything you publish as a creator on CONNEXA.">
          <div className="space-y-4">
            <LockedFeaturePreview blurb="The creator dashboard gathers your reach and everything you publish into one screen. Here is what it brings together:" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {previewTiles.map((t) => (
                <div key={t.label} className="card p-4 space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>{t.label}</p>
                  <p className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>—</p>
                </div>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {previewShortcuts.map((s) => (
                <div key={s.label} className="card p-4 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--border)" }}>
                    {s.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>{s.label}</span>
                    <span className="block font-extrabold truncate" style={{ color: "var(--text-primary)" }}>—</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ProFrame>
      </AppLayout>
    );
  }

  const [a, events, listings, attempts, badges] = await Promise.all([
    proAnalytics(supabase, user.id, "30d"),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    supabase.from("listings").select("id, status").eq("owner_id", user.id),
    supabase.from("quiz_attempts").select("id, score, total", { count: "exact" }).eq("user_id", user.id),
    supabase.from("user_badges").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  const approvedListings = listings.data?.filter((l) => l.status === "approved").length ?? 0;
  const pendingListings = listings.data?.filter((l) => l.status === "pending").length ?? 0;
  const quizScore = (attempts.data ?? []).reduce((sum, x) => sum + x.score, 0);
  const quizTotal = (attempts.data ?? []).reduce((sum, x) => sum + x.total, 0);

  const tiles = [
    { label: "Post views (30d)", value: compactCount(a.postViews), growth: growthLabel(a.postViews, a.postViewsPrev), href: "/pro/analytics" },
    { label: "Profile visits (30d)", value: compactCount(a.visits), growth: growthLabel(a.visits, a.visitsPrev), href: "/pro/analytics" },
    { label: "Reactions (30d)", value: compactCount(a.reactions), growth: growthLabel(a.reactions, a.reactionsPrev), href: "/pro/analytics" },
    { label: "Comments (30d)", value: compactCount(a.comments), growth: growthLabel(a.comments, a.commentsPrev), href: "/pro/analytics" },
  ];

  const shortcuts = [
    { href: "/pro/events", label: "Events hosted", value: compactCount(events.count ?? 0), icon: <CalendarDays className="w-4 h-4" /> },
    { href: "/pro/marketplace", label: "Listings live", value: `${compactCount(approvedListings)}${pendingListings ? ` · ${pendingListings} pending` : ""}`, icon: <Package className="w-4 h-4" /> },
    { href: "/pro/quizzes", label: "Quiz answers right", value: quizTotal ? `${quizScore}/${quizTotal}` : "Not played", icon: <Trophy className="w-4 h-4" /> },
    { href: "/pro/badges", label: "Badges earned", value: compactCount(badges.count ?? 0), icon: <Award className="w-4 h-4" /> },
  ];

  return (
    <AppLayout>
      <ProFrame title="Creator Dashboard" pro={status.pro} expiresAt={status.expiresAt}
        subtitle="Where your PRO activity meets your audience. Every number is a row that exists right now.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href} className="card p-4 space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>{t.label}</p>
              <p className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>{t.value}</p>
              <p className="text-xs font-bold" style={{ color: t.growth.up ? "rgb(var(--a-500))" : "#ef4444" }}>{t.growth.text}</p>
            </Link>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {shortcuts.map((s) => (
            <Link key={s.href} href={s.href} className="card p-4 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--border)" }}>
                {s.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>{s.label}</span>
                <span className="block font-extrabold truncate" style={{ color: "var(--text-primary)" }}>{s.value}</span>
              </span>
            </Link>
          ))}
        </div>

        <div className="card p-4 space-y-2">
          <h2 className="font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Heart className="w-4 h-4" style={{ color: "var(--brand-gold)" }} />Your strongest posts this month
          </h2>
          {a.topPosts.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              You have not published in the last 30 days, so there is nothing to rank.
            </p>
          ) : (
            <ul className="space-y-2">
              {a.topPosts.slice(0, 5).map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 text-sm">
                  <span className="w-5 font-extrabold" style={{ color: "var(--brand-gold-text)" }}>{i + 1}</span>
                  <span className="flex-1 truncate" style={{ color: "var(--text-primary)" }}>{p.excerpt}</span>
                  <span className="text-xs inline-flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                    <MessageCircle className="w-3.5 h-3.5" />{compactCount(p.comments)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/pro/analytics" className="btn-ghost text-sm">Full analytics</Link>
          <Link href="/pro/memories" className="btn-ghost text-sm">Memories</Link>
          <Link href="/pro/trending" className="btn-ghost text-sm">Trending hashtags</Link>
        </div>
      </ProFrame>
    </AppLayout>
  );
}
