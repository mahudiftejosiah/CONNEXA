"use client";

import { cn, getAvatarUrl } from "@/lib/utils";
import { useStoryRings } from "@/components/layout/StoryRingProvider";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  ring?: boolean;
  online?: boolean;
  userId?: string;
}

export function Avatar({
  src,
  name,
  size = 40,
  className,
  ring = false,
  online = false,
  userId,
}: AvatarProps) {
  const fallback = getAvatarUrl(name, size * 2);
  const imgSrc = src || fallback;

  const storyRings = useStoryRings();
  const hasStory = !!userId && storyRings.has(userId);
  const showRing = ring || hasStory;

  return (
    <div
      className={cn("relative flex-shrink-0 inline-block", className)}
      style={{ width: size, height: size }}
    >
      {showRing && (
        <span
          className="absolute rounded-full"
          style={{
            width: size + 5,
            height: size + 5,
            top: -2.5,
            left: -2.5,
            border: "2px solid var(--brand-gold)",
            boxShadow: "0 0 5px rgba(214, 184, 117, 0.35)",
            pointerEvents: "none",
          }}
          aria-hidden="true"
        />
      )}

      {/* Profile picture */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgSrc}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover bg-gray-100"
        style={{
          width: size,
          height: size,
        }}
        onError={(e) => {
          const target = e.currentTarget;
          if (target.src !== fallback) {
            target.src = fallback;
          }
        }}
        loading="lazy"
      />

      {/* Online indicator */}
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2"
          style={{
            width: 10,
            height: 10,
            backgroundColor: "rgb(var(--a-500))",
            borderColor: "var(--bg-card)",
          }}
        />
      )}
    </div>
  );
}