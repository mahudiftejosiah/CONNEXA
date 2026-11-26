import { cn } from "@/lib/utils";
import type { Gender } from "@/lib/supabase/types";

interface GenderSilhouetteProps {
  gender?: Gender | string | null;
  className?: string;
  title?: string;
}

/**
 * Facebook-style default avatar: a flat bust on a plain disc. The three shapes
 * differ only in the outline — short hair, long hair, and the plain head — so
 * they stay recognisable at the 20px sizes used in lists and admin tables.
 */
const SHAPES: Record<string, React.ReactNode> = {
  male: (
    <>
      <circle cx="50" cy="38" r="15.5" />
      <path d="M34 30c3-7.5 8.6-11.5 16-11.5S63 22.5 66 30c-4.5-3-10-4.6-16-4.6S38.5 27 34 30z" />
    </>
  ),
  female: (
    <>
      <ellipse cx="50" cy="38" rx="21" ry="20" />
      <rect x="28" y="36" width="8" height="36" rx="4" />
      <rect x="64" y="36" width="8" height="36" rx="4" />
    </>
  ),
  other: (
    <>
      <circle cx="50" cy="37" r="16" />
    </>
  ),
};

const SHOULDERS =
  "M50 56c-15.5 0-28.5 10.6-31 24.4C17.7 85.9 17 91.2 17 96h66c0-4.8-.7-10.1-2-15.6C78.5 66.6 65.5 56 50 56z";

export function GenderSilhouette({ gender, className, title }: GenderSilhouetteProps) {
  const key = (gender || "other").toString().trim().toLowerCase();
  const shape = SHAPES[key] || SHAPES.other;

  return (
    <span
      className={cn("flex items-center justify-center overflow-hidden rounded-full", className)}
      style={{ backgroundColor: "var(--border)" }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full block" style={{ color: "var(--text-secondary)" }}>
        <g fill="currentColor">
          {shape}
          <path d={SHOULDERS} />
        </g>
      </svg>
    </span>
  );
}

/** True when the person picked a gender, so the silhouette replaces the initials. */
export function hasGender(gender?: string | null): boolean {
  const key = (gender || "").toString().trim().toLowerCase();
  return key === "male" || key === "female" || key === "other";
}
