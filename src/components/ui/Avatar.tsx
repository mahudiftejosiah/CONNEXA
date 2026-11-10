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

export function Avatar({ src, name, size = 40, className, ring = false, online = false, userId }: AvatarProps) {
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
          className="story-ring absolute rounded-full"
          style={{
            width: size + 4, height: size + 4, top: -2, left: -2,
            ...(hasStory ? { background: "#22c55e" } : {}),
          }}
          aria-hidden="true"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgSrc}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover bg-gray-100"
        style={{ width: size, height: size }}
        onError={(e) => {
          const target = e.currentTarget;
          if (target.src !== fallback) target.src = fallback;
        }}
        loading="lazy"
      />
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2"
          style={{
            width: 10, height: 10,
            backgroundColor: "rgb(var(--a-500))",
            borderColor: "var(--bg-card)",
          }}
        />
      )}
    </div>
  );
}
