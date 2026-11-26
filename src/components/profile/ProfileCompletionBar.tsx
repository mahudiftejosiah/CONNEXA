"use client";

import { useState } from "react";
import { CheckCircle, Circle, ChevronRight } from "lucide-react";
import type { Profile } from "@/lib/supabase/types";
import Link from "next/link";

interface ProfileCompletionBarProps {
  profile: Profile;
}

interface CompletionItem {
  key: string;
  label: string;
  done: boolean;
  href: string;
}

export function calculateCompletion(profile: Profile): {
  items: CompletionItem[];
  percent: number;
} {
  const items: CompletionItem[] = [
    {
      key: "gender",
      label: "Select your gender",
      done: profile.gender === "male" || profile.gender === "female" || profile.gender === "other",
      href: "/settings/profile",
    },
    {
      key: "avatar",
      label: "Upload a profile photo",
      // A URL that starts with http and is NOT a ui-avatars URL = real upload
      done: !!profile.avatar_url && !profile.avatar_url.includes("ui-avatars.com"),
      href: "/settings/profile",
    },
    {
      key: "cover",
      label: "Add a cover photo",
      done: !!profile.cover_url,
      href: "/settings/profile",
    },
    {
      key: "bio",
      label: "Write a bio",
      done: !!profile.bio && profile.bio.trim().length > 0,
      href: "/settings/profile",
    },
    {
      key: "interests",
      label: "Add interests",
      done: Array.isArray(profile.interests) && profile.interests.length > 0,
      href: "/settings/profile",
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const percent = Math.round((doneCount / items.length) * 100);
  return { items, percent };
}

export function ProfileCompletionBar({ profile }: ProfileCompletionBarProps) {
  const [expanded, setExpanded] = useState(false);
  const { items, percent } = calculateCompletion(profile);
  const incomplete = items.filter((i) => !i.done);

  // Hide when fully complete and user has dismissed
  if (percent === 100) {
    return (
      <div className="card p-4 flex items-center gap-3">
        <CheckCircle className="w-6 h-6 flex-shrink-0" style={{ color: "#D6B875" }} />
        <div>
          <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
            Profile complete! 🎉
          </p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Your profile is fully set up.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full p-4 flex items-center gap-3 text-left hover:bg-[var(--border)] transition-colors"
      >
        {/* Progress ring */}
        <div className="relative w-12 h-12 flex-shrink-0">
          <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3"
              style={{ stroke: "var(--border)" }} />
            <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3"
              strokeDasharray={`${percent} ${100 - percent}`}
              strokeLinecap="round"
              style={{ stroke: "#D6B875", transition: "stroke-dasharray 0.5s ease" }} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold"
            style={{ color: "#D6B875" }}>
            {percent}%
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
            Complete your profile
          </p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Your profile is {percent}% complete — {incomplete.length} step{incomplete.length !== 1 ? "s" : ""} remaining
          </p>
          {/* Bar */}
          <div className="mt-1.5 h-1.5 w-full rounded-full" style={{ background: "var(--border)" }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${percent}%`, background: "#D6B875" }} />
          </div>
        </div>

        <ChevronRight
          className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
          style={{
            color: "var(--text-secondary)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {expanded && (
        <div className="border-t px-4 pb-4 space-y-2 pt-3"
          style={{ borderColor: "var(--border)" }}>
          {items.map((item) => (
            <div key={item.key} className="flex items-center gap-3">
              {item.done
                ? <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: "#D6B875" }} />
                : <Circle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--border)" }} />}
              <span className="flex-1 text-sm"
                style={{ color: item.done ? "var(--text-secondary)" : "var(--text-primary)",
                         textDecoration: item.done ? "line-through" : "none" }}>
                {item.label}
              </span>
              {!item.done && (
                <Link href={item.href}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
                  style={{ background: "rgba(18,55,42,0.08)", color: "#12372A" }}>
                  Add
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
