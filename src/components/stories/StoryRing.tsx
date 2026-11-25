"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** The CONNEXA champagne gold used for every story indicator. */
export const STORY_GOLD = "#D6B875";

interface StoryRingProps {
  /** Diameter of the picture the ring goes around. */
  size: number;
  /** How thick the ring itself is. */
  thickness?: number;
  /** Breathing space between the picture and the ring. */
  gap?: number;
  /** A watched story keeps a quiet ring instead of the bright one. */
  seen?: boolean;
  className?: string;
}

/**
 * The golden ring around a story avatar.
 *
 * It is drawn over the picture with a transparent hole, so the picture stays
 * exactly as it is — same image, same shape, same size.
 */
export function StoryRing({
  size,
  thickness = 3,
  gap = 2,
  seen = false,
  className,
}: StoryRingProps) {
  const hole = size / 2 + gap;
  const outer = hole + thickness;

  const style = {
    width: size + outer * 2,
    height: size + outer * 2,
    left: -outer,
    top: -outer,
    "--story-hole": `${hole}px`,
    "--story-outer": `${outer}px`,
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={cn("story-ring", seen && "story-ring-seen", className)}
      style={style}
    />
  );
}
