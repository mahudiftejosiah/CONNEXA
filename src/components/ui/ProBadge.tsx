import { BadgeCheck } from "lucide-react";
import { hasActivePro } from "@/lib/pro";

type Account = { is_verified?: boolean | null; pro_expires_at?: string | null } | null | undefined;

// A photographed gold crown rather than a word: it reads at a glance next to a
// name and carries its own colour, so it looks the same in either theme.
export function ProBadge({ size = 18, title = "CONNEXA PRO member" }: { size?: number; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center align-middle leading-none">
      <img
        src="/crown.png"
        alt=""
        width={size}
        height={size}
        draggable={false}
        className="inline-block select-none"
        style={{ width: size, height: size, filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.28))" }}
      />
      <span className="sr-only">{title}</span>
    </span>
  );
}

// One mark per account: the gold crown while PRO is live, the plain tick for a
// verified account whose subscription has lapsed, nothing at all otherwise.
export function AccountBadge({ account, size = 14 }: { account: Account; size?: number }) {
  if (!account?.is_verified) return null;
  if (hasActivePro(account)) return <ProBadge size={size + 4} />;
  return (
    <span title="Verified account" className="inline-flex items-center align-middle" style={{ color: "#16a34a" }}>
      <BadgeCheck width={size} height={size} fill="currentColor" stroke="#fff" strokeWidth={1.4} />
    </span>
  );
}