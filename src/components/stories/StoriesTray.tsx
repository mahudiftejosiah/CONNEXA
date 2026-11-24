"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { StoryWithAuthor, Profile } from "@/lib/supabase/types";

interface StoriesTrayProps {
  stories: StoryWithAuthor[];
  profile: Profile;
  currentUserId: string;
  onCreate?: () => void;
  onOpen?: (authorId: string) => void;
}

function TrayTile({
  href,
  onClick,
  className,
  children,
}: {
  href: string;
  onClick?: () => void;
  className: string;
  children: React.ReactNode;
}) {
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function StoriesTray({
  stories,
  profile,
  currentUserId,
  onCreate,
  onOpen,
}: StoriesTrayProps) {
  const grouped = stories.reduce(
    (acc, story) => {
      const id = story.author_id;

      if (!acc[id]) {
        acc[id] = {
          author: story.author,
          hasUnviewed: false,
        };
      }

      if (!story.has_viewed) {
        acc[id].hasUnviewed = true;
      }

      return acc;
    },
    {} as Record<
      string,
      {
        author: Profile;
        hasUnviewed: boolean;
      }
    >
  );

  const groups = Object.values(grouped).filter(
    (group) => group.author.id !== currentUserId
  );

  const hasOwnStory = stories.some(
    (story) => story.author_id === currentUserId
  );

  function handleOwnStory() {
    if (hasOwnStory) {
      if (onOpen) onOpen(currentUserId);
      else window.location.href = "/stories";
    } else {
      if (onCreate) onCreate();
      else window.location.href = "/stories";
    }
  }

  return (
    <div className="card p-3">
      <div className="rail flex items-start gap-4 pb-1">

        {/* Your story */}
        <button
          type="button"
          onClick={handleOwnStory}
          className="flex-shrink-0 flex flex-col items-center gap-1.5 w-16"
        >
          <span
            className="relative block w-14 h-14 rounded-full p-[2px]"
            style={{
              background: hasOwnStory
                ? "var(--brand-gold)"
                : "var(--border)",
            }}
          >
            <span
              className="relative block w-full h-full rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--bg)" }}
            >
              <Avatar
                src={profile.avatar_url}
                name={profile.display_name}
                size={52}
              />

              <span
                className="absolute bottom-0 right-0 w-5 h-5 rounded-full flex items-center justify-center border-2"
                style={{
                  backgroundColor: "var(--brand-gold)",
                  borderColor: "var(--bg-card)",
                }}
              >
                <Plus className="w-3 h-3 text-white" />
              </span>
            </span>
          </span>

          <span
            className="text-xs font-medium truncate w-full text-center"
            style={{ color: "var(--text-secondary)" }}
          >
            Your story
          </span>
        </button>

        {/* Friends' and followed users' stories */}
        {groups.map((group) => (
          <TrayTile
            key={group.author.id}
            href="/stories"
            onClick={
              onOpen
                ? () => onOpen(group.author.id)
                : undefined
            }
            className="flex-shrink-0 flex flex-col items-center gap-1.5 w-16"
          >
            <span
              className="relative block w-14 h-14 rounded-full p-[2px]"
              style={{
                background: group.hasUnviewed
                  ? "var(--brand-gold)"
                  : "var(--border)",
              }}
            >
              <span className="block w-full h-full rounded-full overflow-hidden">
                <Avatar
                  src={group.author.avatar_url}
                  name={group.author.display_name}
                  size={52}
                />
              </span>
            </span>

            <span
              className="text-xs font-medium truncate w-full text-center"
              style={{ color: "var(--text-secondary)" }}
            >
              {group.author.display_name.split(" ")[0]}
            </span>
          </TrayTile>
        ))}

      </div>
    </div>
  );
}