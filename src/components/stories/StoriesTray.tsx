"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
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

export function StoriesTray({ stories, profile, currentUserId, onCreate, onOpen }: StoriesTrayProps) {
  const grouped = stories.reduce((acc, story) => {
    const id = story.author_id;
    if (!acc[id]) acc[id] = { author: story.author, hasUnviewed: false, first: story };
    if (!story.has_viewed) acc[id].hasUnviewed = true;
    return acc;
  }, {} as Record<string, { author: Profile; hasUnviewed: boolean; first: StoryWithAuthor }>);

  // Current user's own group always goes first
  const groups = Object.values(grouped).sort((a, b) =>
    (a.author.id === currentUserId ? -1 : b.author.id === currentUserId ? 1 : 0)
  );

  return (
    <div className="card p-3">
      <div className="rail flex items-start gap-4 pb-1">
        {/* Your story */}
        <TrayTile href="/stories" onClick={onCreate} className="flex-shrink-0 flex flex-col items-center gap-1.5 w-16 group">
          <span className="relative block w-14 h-14 rounded-full p-[2px]" style={{ background: "var(--border)" }}>
            <span className="relative block w-full h-full rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg)" }}>
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-sm font-bold" style={{ color: "var(--text-secondary)" }}>
                  {profile.display_name.charAt(0)}
                </span>
              )}
              <span
                className="absolute bottom-0 right-0 w-5 h-5 rounded-full flex items-center justify-center border-2"
                style={{ backgroundColor: "var(--brand-gold)", borderColor: "var(--bg-card)" }}
              >
                <Plus className="w-3 h-3 text-white" />
              </span>
            </span>
          </span>
          <span className="text-xs font-medium truncate w-full text-center" style={{ color: "var(--text-secondary)" }}>
            Your story
          </span>
        </TrayTile>

        {groups.map((g) => (
          <TrayTile key={g.author.id} href="/stories" onClick={onOpen && (() => onOpen(g.author.id))} className="flex-shrink-0 flex flex-col items-center gap-1.5 w-16">
            <span
              className="relative block w-14 h-14 rounded-full p-[2px]"
              style={{ background: g.hasUnviewed ? "#22c55e" : "var(--border)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.first.media_type === "image" ? g.first.media_url : (g.author.avatar_url || undefined)}
                alt=""
                className="w-full h-full rounded-full object-cover block"
                style={{ backgroundColor: "var(--bg)" }}
              />
              <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2">
                <span
                  className="block w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ borderColor: "var(--bg-card)", backgroundColor: "var(--brand-green)" }}
                >
                  {g.author.display_name.charAt(0)}
                </span>
              </span>
            </span>
            <span className="text-xs font-medium truncate w-full text-center" style={{ color: "var(--text-secondary)" }}>
              {g.author.id === currentUserId ? "You" : g.author.display_name.split(" ")[0]}
            </span>
          </TrayTile>
        ))}
      </div>
    </div>
  );
}
