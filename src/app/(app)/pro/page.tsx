import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Lock, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProFrame } from "@/components/pro/ProFrame";
import { UpgradePanel } from "@/components/profile/UpgradePanel";
import { getProStatus, listProFeatures } from "@/lib/pro";
import { PRO_BUCKETS, featuresInBucket } from "@/lib/pro-catalog";
import { trendingHashtags } from "@/lib/pro-analytics";
import { compactCount } from "@/lib/utils";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CONNEXA PRO" };

const UPGRADE_FALLBACK =
  "PRICE: 0\nPAY TO ACCOUNT NAME: CONNEXA\nPAY TO ACCOUNT NUMBER: —\nINSTRUCTIONS: PRO is being set up. Check back shortly.";

export default async function ProPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [status, switches, tags, profileRes, upgradeContent, ownUpgrade] = await Promise.all([
    getProStatus(supabase, user.id),
    listProFeatures(supabase),
    trendingHashtags(supabase, 7, 10),
    supabase.from("profiles").select("username, display_name, is_verified").eq("id", user.id).single(),
    supabase.from("site_content").select("body").eq("key", "upgrade").single(),
    supabase.from("account_upgrades").select("status, reference").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const enabledByKey = new Map(switches.map((f) => [f.key, f.enabled]));
  const username = profileRes.data?.username ?? "";

  return (
    <AppLayout>
      <ProFrame
        title={status.pro ? "Your PRO membership" : "CONNEXA PRO"}
        subtitle={status.pro
          ? "Everything below is unlocked on your account. Switches an administrator turns off appear here as unavailable."
          : "PRO is the verified account you can already buy, with the tools around it: analytics, community features, entertainment and a creator shelf."}
        pro={status.pro}
        expiresAt={status.expiresAt}
      >
        {!status.pro && (
          <div id="upgrade" className="space-y-3">
            <UpgradePanel
              userId={user.id}
              verified={!!profileRes.data?.is_verified}
              initialStatus={(ownUpgrade.data?.status as "none" | "pending" | "approved" | "rejected" | undefined) ?? "none"}
              initialReference={ownUpgrade.data?.reference ?? null}
              configText={upgradeContent.data?.body || UPGRADE_FALLBACK}
            />
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Confirmation happens on the server. No page can switch PRO on by itself.
            </p>
          </div>
        )}

        {status.pro && status.expiresAt && (
          <div className="card p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Membership ends</p>
              <p className="font-bold" style={{ color: "var(--text-primary)" }}>
                {new Date(status.expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Friend limit</p>
              <p className="font-bold" style={{ color: "var(--text-primary)" }}>{compactCount(status.friendLimit)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Daily requests</p>
              <p className="font-bold" style={{ color: "var(--text-primary)" }}>Unlimited</p>
            </div>
            {username && (
              <Link href={`/profile/${username}`} className="btn-ghost text-sm ml-auto">View my profile</Link>
            )}
          </div>
        )}

        {PRO_BUCKETS.map((bucket) => (
          <section key={bucket.id} className="space-y-3">
            <div>
              <h2 className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>{bucket.label}</h2>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{bucket.note}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {featuresInBucket(bucket.id).map((feature) => {
                const off = enabledByKey.get(feature.key) === false;
                const openable = status.pro && !off && feature.href;
                return (
                  <div key={feature.key} className="card p-4 flex flex-col gap-2 relative">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold leading-snug" style={{ color: "var(--text-primary)" }}>{feature.label}</h3>
                      {off ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                          style={{ background: "var(--border)", color: "var(--text-secondary)" }}>Switched off</span>
                      ) : status.pro ? (
                        <Check className="w-4 h-4 flex-shrink-0" style={{ color: "var(--brand-green)" }} />
                      ) : (
                        <Lock className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-secondary)" }} />
                      )}
                    </div>
                    <p className="text-sm flex-1" style={{ color: "var(--text-secondary)" }}>{feature.blurb}</p>
                    {openable ? (
                      <Link href={feature.href!} className="btn-primary text-sm self-start">Open</Link>
                    ) : off ? (
                      <span className="text-sm font-semibold self-start" style={{ color: "var(--text-secondary)" }}>
                        Switched off by an administrator
                      </span>
                    ) : (
                      <a href="#upgrade" className="text-sm font-semibold self-start" style={{ color: "var(--brand-gold-text)" }}>
                        Upgrade to PRO
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <section className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: "var(--brand-gold)" }} />
            <h2 className="font-extrabold" style={{ color: "var(--text-primary)" }}>Trending on CONNEXA this week</h2>
          </div>
          {tags.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              No hashtags have been used in the last seven days. This list is built from live posts.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((t, i) => (
                <Link key={t.tag} href={`/search?q=${encodeURIComponent(`#${t.tag}`)}`}
                  className="px-3 py-1.5 rounded-full text-sm font-semibold inline-flex items-center gap-1.5"
                  style={{ background: i < 3 && status.pro ? "var(--brand-gold)" : "var(--border)", color: "var(--text-primary)" }}>
                  #{t.tag}
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{compactCount(t.posts)}</span>
                </Link>
              ))}
            </div>
          )}
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Counts are posts published in the last 7 days that carry the tag. An administrator can remove a tag from this chart.
          </p>
        </section>
      </ProFrame>
    </AppLayout>
  );
}
