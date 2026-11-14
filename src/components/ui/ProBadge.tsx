import { BadgeCheck } from "lucide-react";
import { hasActivePro } from "@/lib/pro";

type Account = { is_verified?: boolean | null; pro_expires_at?: string | null } | null | undefined;

// Champagne gold on midnight green, built from the theme variables so it turns
// with the rest of the palette rather than sitting on top of it.
export function ProBadge({ title = "CONNEXA PRO member" }: { title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-full px-1.5 py-px align-middle text-[9px] font-extrabold uppercase tracking-wider"
      style={{ background: "var(--brand-gold)", color: "var(--brand-green)" }}
    >
      PRO
    </span>
  );
}

// One mark per account: the gold badge while PRO is live, the plain tick for a
// verified account whose subscription has lapsed, nothing at all otherwise.
export function AccountBadge({ account, size = 14 }: { account: Account; size?: number }) {
  if (!account?.is_verified) return null;
  if (hasActivePro(account)) return <ProBadge />;
  return (
    <span title="Verified account" className="inline-flex items-center align-middle" style={{ color: "#16a34a" }}>
      <BadgeCheck width={size} height={size} fill="currentColor" stroke="#fff" strokeWidth={1.4} />
    </span>
  );
}
