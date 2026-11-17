import { Lock } from "lucide-react";

// The banner a PRO board shows to a visitor who is not PRO. It sits above a
// real preview drawn from the same query the page already runs, so the glimpse
// is genuine rather than invented, and points to /pro#upgrade.
export function LockedFeaturePreview({ blurb }: { blurb: string }) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <Lock className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "var(--brand-gold)" }} />
      <div>
        <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Preview only</p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {blurb}{" "}
          <a href="/pro#upgrade" style={{ color: "var(--brand-gold-text)", fontWeight: 700 }}>Upgrade to PRO</a>.
        </p>
      </div>
    </div>
  );
}
