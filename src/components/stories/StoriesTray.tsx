"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { StoryRing } from "@/components/stories/StoryRing";
import { groupStories } from "@/lib/stories";
import type { StoryWithAuthor, Profile } from "@/lib/supabase/types";

interface StoriesTrayProps {
  stories: StoryWithAuthor[];
  profile: Profile;
  currentUserId: string;
  // On the stories page the tray opens the viewer in place instead of linking
  // back to /stories, which would just reload the same page.
  onCreate?: () => void;
  onOpen?: (authorId: string) => void;
}

const TILE = 56; // the picture itself; the ring is drawn around it

function TrayTile({ href, onClick, className, children }: {
  href: string;
  onClick?: () => void;
  className: string;
  children: React.ReactNode;
}) {
  return onClick ? (
    <button onClick={onClick} className={className}>{children}</button>
  ) : (
    <Link href={href} className={className}>{children}</Link>
  );
}

function AvatarPicture({ author, className }: { author: Profile; className?: string }) {
  if (author.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={author.avatar_url} alt="" className={`w-full h-full object-cover ${className ?? ""}`} />
    );
  }
  return (
    <span className={`w-full h-full flex items-center justify-center text-sm font-bold ${className ?? ""}`} style={{ color: "var(--text-secondary)" }}>
      {author.display_name.charAt(0)}
    </span>
  );
}

export function StoriesTray({ stories, profile, currentUserId, onCreate, onOpen }: StoriesTrayProps) {
  // The order the tray reads in: the viewer's own story first, then everybody
  // who has something they have not watched yet, then the ones they have seen.
  const groups = groupStories(stories, currentUserId);
  const ownGroup = groups.find((g) => g.author.id === currentUserId);
  const others = groups.filter((g) => g.author.id !== currentUserId);

  // Your own tile opens your story when you have one and the composer when
  // you do not — never a page to travel to first.
  const ownTileClick = () => (ownGroup && onOpen ? onOpen(currentUserId) : onCreate?.());

  return (
    <div className="card p-3">
      <div className="rail flex items-start gap-4 pb-1">
        {/* Your story */}
        <TrayTile href="/stories" onClick={ownTileClick} className="flex-shrink-0 flex flex-col items-center gap-1.5 w-16 group">
          <span className="relative block w-14 h-14 rounded-full">
            {ownGroup && <StoryRing size={TILE} />}
            <span className="relative block w-full h-full rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg)" }}>
              <AvatarPicture author={profile} />
              <span
                className="absolute bottom-0 right-0 w-5 h-5 rounded-full flex items-center justify-center border-2"
                style={{ backgroundColor: "#D6B875", borderColor: "var(--bg-card)" }}
              >
                <Plus className="w-3 h-3 text-black" />
              </span>
            </span>
          </span>
          <span className="text-xs font-medium truncate w-full text-center" style={{ color: "var(--text-secondary)" }}>
            Your story
          </span>
        </TrayTile>

        {others.map((g) => (
          <TrayTile
            key={g.author.id}
            href="/stories"
            onClick={onOpen && (() => onOpen(g.author.id))}
            className="flex-shrink-0 flex flex-col items-center gap-1.5 w-16"
          >
            <span className="relative block w-14 h-14 rounded-full">
              {/* The golden ring belongs to this viewer: it is on while a story
                  of theirs is still unwatched, and quiet once they have seen it. */}
              <StoryRing size={TILE} seen={!g.hasUnviewed} />
              <span className="relative block w-full h-full rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg)" }}>
                <AvatarPicture author={g.author} />
              </span>
            </span>
            <span className="text-xs font-medium truncate w-full text-center" style={{ color: "var(--text-secondary)" }}>
              {g.author.display_name.split(" ")[0]}
            </span>
          </TrayTile>
        ))}
      </div>
    </div>
  );
}
