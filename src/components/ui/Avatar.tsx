"use client";

import { useState } from "react";
import { cn, getAvatarUrl } from "@/lib/utils";
import { useStoryRings } from "@/components/layout/StoryRingProvider";
import { GenderSilhouette, hasGender } from "@/components/ui/GenderSilhouette";
import { StoryRing } from "@/components/stories/StoryRing";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  ring?: boolean;
  online?: boolean;
  userId?: string;
  gender?: string | null;
}

export function Avatar({ src, name, size = 40, className, ring = false, online = false, userId, gender }: AvatarProps) {
  const fallback = getAvatarUrl(name, size * 2);
  const imgSrc = src || fallback;
  const [broken, setBroken] = useState(false);
  const storyRings = useStoryRings();
  const hasStory = !!userId && storyRings.has(userId);
  const showRing = ring || hasStory;
  // A person who picked a gender gets the silhouette instead of their initials.
  // Until migration 038 lands nobody has a gender, so every avatar stays as it is.
  const showSilhouette = hasGender(gender) && (!src || broken);

  return (
    <div
      className={cn("relative flex-shrink-0 inline-block", className)}
      style={{ width: size, height: size }}
    >
      {showRing && (
        // The ring is drawn around the picture, never over it: the picture
        // keeps its own colours and shape, and only gains a champagne edge.
        <StoryRing size={size} seen={!hasStory} thickness={hasStory ? 3 : 2} />
      )}
      {showSilhouette ? (
        <span className="relative z-[1] block h-full w-full">
          <GenderSilhouette gender={gender} className="h-full w-full" title={name} />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc}
          alt={name}
          width={size}
          height={size}
          className="relative z-[1] rounded-full object-cover bg-gray-100"
          style={{ width: size, height: size }}
          onError={(e) => {
            const target = e.currentTarget;
            if (target.src !== fallback) target.src = fallback;
            if (hasGender(gender)) setBroken(true);
          }}
          loading="lazy"
        />
      )}
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
