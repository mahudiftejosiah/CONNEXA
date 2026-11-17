"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Award, Check, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { refreshMyBadges } from "@/lib/actions/pro";
import { Skeleton } from "@/components/ui/Skeleton";
import { LockedFeaturePreview } from "@/components/pro/LockedFeaturePreview";

type BadgeRow = {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  condition_key: string;
  threshold: number;
  current: number;
  earned: boolean;
};

export function BadgeShelf({
  badges,
  labels,
  canCheck,
  pro,
}: {
  badges: BadgeRow[];
  labels: Record<string, string>;
  canCheck: boolean;
  pro: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ready, setReady] = useState(false);
  const earned = badges.filter((b) => b.earned);
  const next = badges.filter((b) => !b.earned).slice(0, 6);
  // A non-PRO visitor sees a real, shorter slice of the same shelf.
  const grid = pro ? badges : badges.slice(0, 6);

  useEffect(() => setReady(true), []);

  function check() {
    start(async () => {
      const res = await refreshMyBadges();
      if ("error" in res) { toast.error(res.error); return; }
      if (res.earned?.length) toast.success(`${res.earned.length} badge${res.earned.length === 1 ? "" : "s"} on your shelf.`);
      else toast("Nothing new yet — keep going.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <Award className="w-5 h-5" style={{ color: "var(--brand-gold)" }} />
        <p className="text-sm flex-1" style={{ color: "var(--text-primary)" }}>
          <span className="font-extrabold">{earned.length}</span> of {badges.length} badges earned.
        </p>
        <button type="button" className="btn-primary text-sm inline-flex items-center gap-2" disabled={pending || !canCheck} onClick={check}>
          <RefreshCw className="w-4 h-4" /> Check my activity
        </button>
      </div>

      {!pro && (
        <LockedFeaturePreview blurb="A few badges and your live progress are shown here; the full shelf is a PRO feature." />
      )}

      {!ready ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card p-4 flex gap-3 items-start">
              <Skeleton className="w-11 h-11 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : badges.length === 0 ? (
        <div className="card p-8 text-center" style={{ color: "var(--text-secondary)" }}>
          No badge has been defined yet. An administrator creates them in Admin → PRO Management.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {grid.map((b) => (
            <div key={b.id} className="card p-4 flex gap-3 items-start">
              {b.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.icon_url} alt="" className="w-11 h-11 flex-shrink-0 object-contain" />
              ) : (
                <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: b.earned ? "var(--brand-gold)" : "var(--border)" }}>
                  <Award className="w-5 h-5" style={{ color: b.earned ? "var(--brand-green)" : "var(--text-secondary)" }} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                  {b.name}
                  {b.earned && <Check className="w-4 h-4" style={{ color: "var(--brand-gold)" }} />}
                </p>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{b.description}</p>
                {!b.earned && (
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                      <span className="block h-full" style={{
                        width: `${Math.min(100, Math.round((b.current / b.threshold) * 100))}%`,
                        background: "var(--brand-gold)",
                      }} />
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
                      {b.current} / {b.threshold} {labels[b.condition_key] ?? b.condition_key}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {next.length > 0 && (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          The closest ones left: {next.map((b) => `${b.name} (${b.current}/${b.threshold})`).join(", ")}.
        </p>
      )}
    </div>
  );
}
