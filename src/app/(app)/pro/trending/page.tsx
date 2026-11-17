import Link from "next/link";
import { redirect } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProFrame } from "@/components/pro/ProFrame";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { LockedFeaturePreview } from "@/components/pro/LockedFeaturePreview";
import { trendingHashtags } from "@/lib/pro-analytics";
import { getProStatus } from "@/lib/pro";
import { compactCount, cn } from "@/lib/utils";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trending Hashtags" };

export default async function TrendingPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: raw } = await searchParams;
  const days = raw === "30" ? 30 : 7;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [status, tags] = await Promise.all([
    getProStatus(supabase, user.id),
    trendingHashtags(supabase, days, 40),
  ]);

  const peak = tags[0]?.posts ?? 0;
  // A non-PRO visitor gets a real, shorter slice of the same live ranking.
  const preview = status.pro ? tags : tags.slice(0, 5);

  return (
    <AppLayout>
      <ProFrame title="Trending Hashtags" pro={status.pro} expiresAt={status.expiresAt}
        subtitle="Counted from the posts CONNEXA actually has, over the window you pick. Nothing here is a curated list.">
        <div className="flex gap-2">
          {[7, 30].map((d) => (
            <Link key={d} href={`/pro/trending?days=${d}`}
              className={cn("px-3 py-1.5 rounded-full text-sm font-semibold border", d === days ? "border-transparent" : "")}
              style={d === days
                ? { background: "var(--brand-gold)", color: "var(--brand-green)" }
                : { borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              Last {d} days
            </Link>
          ))}
        </div>

        {!status.pro && (
          <LockedFeaturePreview blurb="The first of this window's live ranking is shown here; the full list is a PRO feature." />
        )}

        {tags.length === 0 ? (
          <ProDataNote>
            No hashtag has been used in a post in the last {days} days, so there is nothing to rank.
          </ProDataNote>
        ) : (
          <ol className="card divide-y" style={{ borderColor: "var(--border)" }}>
            {preview.map((t, i) => (
              <li key={t.tag} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 text-sm font-extrabold" style={{ color: "var(--text-secondary)" }}>{i + 1}</span>
                <TrendingUp className="w-4 h-4" style={{ color: i < 3 ? "var(--brand-gold)" : "var(--text-secondary)" }} />
                <Link href={`/search?q=${encodeURIComponent(`#${t.tag}`)}`} className="font-semibold hover:underline"
                  style={{ color: "var(--text-primary)" }}>
                  #{t.tag}
                </Link>
                <span className="ml-auto text-sm font-bold" style={{ color: "var(--text-secondary)" }}>{compactCount(t.posts)} posts</span>
                <span className="hidden sm:block w-28 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <span className="block h-full" style={{ width: `${peak === 0 ? 0 : Math.round((t.posts / peak) * 100)}%`, background: "var(--brand-gold)" }} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </ProFrame>
    </AppLayout>
  );
}
