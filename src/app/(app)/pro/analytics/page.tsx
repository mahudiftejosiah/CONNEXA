import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, Heart, MessageCircle, Share2, TrendingUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProFrame } from "@/components/pro/ProFrame";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { LockedFeaturePreview } from "@/components/pro/LockedFeaturePreview";
import { growthLabel, proAnalytics } from "@/lib/pro-analytics";
import { getProStatus } from "@/lib/pro";
import { compactCount, cn } from "@/lib/utils";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "PRO Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: raw } = await searchParams;
  const range = raw === "30d" ? "30d" : "7d";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const status = await getProStatus(supabase, user.id);
  if (!status.pro) {
    const previewTiles = [
      { label: "Profile visits", icon: <Eye className="w-4 h-4" /> },
      { label: "Unique visitors", icon: <Users className="w-4 h-4" /> },
      { label: "Post views", icon: <TrendingUp className="w-4 h-4" /> },
      { label: "Reactions", icon: <Heart className="w-4 h-4" /> },
      { label: "Comments", icon: <MessageCircle className="w-4 h-4" /> },
      { label: "Shares", icon: <Share2 className="w-4 h-4" /> },
    ];
    return (
      <AppLayout>
        <ProFrame title="Advanced Analytics" pro={false} expiresAt={status.expiresAt}
          subtitle="A private look at who reaches your profile, which posts land, and how the audience moves.">
          <div className="space-y-4">
            <LockedFeaturePreview blurb="Analytics counts profile visits, post views, reactions, comments, shares and follower growth from your own rows; visitor identities are never shown. These are the figures it reports:" />
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {previewTiles.map((t) => (
                <div key={t.label} className="card p-4 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                    {t.icon}{t.label}
                  </div>
                  <p className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>—</p>
                </div>
              ))}
            </div>
          </div>
        </ProFrame>
      </AppLayout>
    );
  }

  const a = await proAnalytics(supabase, user.id, range);
  const peak = Math.max(1, ...a.daily.map((d) => Math.max(d.visits, d.postViews, d.reactions)));

  const tiles = [
    { label: "Profile visits", value: a.visits, prev: a.visitsPrev, icon: <Eye className="w-4 h-4" /> },
    { label: "Unique visitors", value: a.visitors, prev: null, icon: <Users className="w-4 h-4" /> },
    { label: "Post views", value: a.postViews, prev: a.postViewsPrev, icon: <TrendingUp className="w-4 h-4" /> },
    { label: "Reactions", value: a.reactions, prev: a.reactionsPrev, icon: <Heart className="w-4 h-4" /> },
    { label: "Comments", value: a.comments, prev: a.commentsPrev, icon: <MessageCircle className="w-4 h-4" /> },
    { label: "Shares", value: a.shares, prev: null, icon: <Share2 className="w-4 h-4" /> },
  ];

  return (
    <AppLayout>
      <ProFrame title="Advanced Analytics" pro={status.pro} expiresAt={status.expiresAt}
        subtitle={`Real rows from the last ${range === "7d" ? "7" : "30"} days. Comparison is the window immediately before it.`}>
        <div className="flex gap-2">
          {(["7d", "30d"] as const).map((r) => (
            <Link key={r} href={`/pro/analytics?range=${r}`}
              className={cn("px-3 py-1.5 rounded-full text-sm font-semibold border", r === range ? "border-transparent" : "")}
              style={r === range
                ? { background: "var(--brand-gold)", color: "var(--brand-green)" }
                : { borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              {r === "7d" ? "Weekly" : "Monthly"}
            </Link>
          ))}
          <span className="ml-auto text-xs self-center" style={{ color: "var(--text-secondary)" }}>
            {a.postsPublished} {a.postsPublished === 1 ? "post" : "posts"} published in this window
          </span>
        </div>

        {!a.trackingReady && (
          <ProDataNote tone="warn">
            Visit and view tracking starts when migration 029 is pasted in Supabase. Reactions, comments, shares and
            follower growth below come from tables that are already live.
          </ProDataNote>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {tiles.map((t) => {
            const growth = t.prev === null ? null : growthLabel(t.value, t.prev);
            return (
              <div key={t.label} className="card p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                  {t.icon}{t.label}
                </div>
                <p className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>{compactCount(t.value)}</p>
                {growth && (
                  <p className="text-xs font-bold" style={{ color: growth.up ? "rgb(var(--a-500))" : "#ef4444" }}>
                    {growth.text} vs previous window
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid lg:grid-cols-3 gap-3">
          <div className="card p-4 lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>Day by day</h2>
              <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: "var(--brand-gold)" }} />visits</span>
                <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: "rgb(var(--a-500))" }} />post views</span>
                <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: "rgb(var(--a-300))" }} />reactions</span>
              </div>
            </div>
            <div className="flex items-end gap-1 h-40">
              {a.daily.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col justify-end gap-0.5" title={`${d.day}: ${d.visits} visits, ${d.postViews} views, ${d.reactions} reactions`}>
                  <span style={{ height: `${(d.visits / peak) * 100}%`, background: "var(--brand-gold)", minHeight: d.visits ? 2 : 0 }} className="rounded-t" />
                  <span style={{ height: `${(d.postViews / peak) * 100}%`, background: "rgb(var(--a-500))", minHeight: d.postViews ? 2 : 0 }} />
                  <span style={{ height: `${(d.reactions / peak) * 100}%`, background: "rgb(var(--a-300))", minHeight: d.reactions ? 2 : 0 }} className="rounded-b" />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[11px]" style={{ color: "var(--text-secondary)" }}>
              <span>{new Date(a.from).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              <span>today</span>
            </div>
          </div>

          <div className="card p-4 space-y-2">
            <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>Engagement</h2>
            <p className="text-3xl font-extrabold" style={{ color: "var(--brand-green)" }}>
              {a.engagementRate === null ? "—" : `${a.engagementRate}%`}
            </p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {a.engagementRate === null
                ? "Reactions, comments and shares divided by post views. It needs at least one recorded view, which starts with migration 029."
                : "Interactions per post view in this window."}
            </p>
            <hr style={{ borderColor: "var(--border)" }} />
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              <span className="font-extrabold" style={{ color: "var(--text-primary)" }}>+{compactCount(a.followerGain)}</span> new followers ·{" "}
              <span className="font-extrabold" style={{ color: "var(--text-primary)" }}>{compactCount(a.followersTotal)}</span> total
            </p>
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>Popular posts in this window</h2>
          {a.topPosts.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>You did not publish anything in these {range === "7d" ? "7" : "30"} days.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {a.topPosts.map((p) => (
                <li key={p.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-sm flex-1 min-w-[200px]" style={{ color: "var(--text-primary)" }}>{p.excerpt}</span>
                  <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{compactCount(p.views)} views</span>
                  <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{compactCount(p.reactions)} reactions</span>
                  <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{compactCount(p.comments)} comments</span>
                  <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{compactCount(p.shares)} shares</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Visitor identities are not part of this dashboard. It stores who visited, so the totals can be counted, and shows only
          aggregates back to you.
        </p>
      </ProFrame>
    </AppLayout>
  );
}
