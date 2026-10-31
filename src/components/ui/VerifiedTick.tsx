import { BadgeCheck } from "lucide-react";

// Green verification tick shown next to a display name for upgraded accounts.
export function VerifiedTick({ size = 16, title = "Verified account" }: { size?: number; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center align-middle" style={{ color: "#16a34a" }}>
      <BadgeCheck width={size} height={size} fill="currentColor" stroke="#fff" strokeWidth={1.4} />
    </span>
  );
}
