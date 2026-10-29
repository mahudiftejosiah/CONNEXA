"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, MessageCircle, Search, Menu, X, Settings } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";

interface NavbarProps {
  profile: Profile | null;
  unreadNotifications?: number;
  unreadMessages?: number;
}

export function Navbar({ profile, unreadNotifications = 0, unreadMessages = 0 }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b shadow-sm" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Logo size="sm" />

        {/* Desktop search */}
        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-secondary)" }} />
            <input
              type="search"
              placeholder="Search people, posts, groups…"
              className="input pl-9 py-2 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search"
            />
          </div>
        </form>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <button
            className="md:hidden p-2 rounded-xl transition-colors hover:bg-[var(--border)]"
            style={{ color: "var(--text-secondary)" }}
            onClick={() => setSearchOpen(!searchOpen)}
            aria-label="Search"
          >
            <Search className="w-5 h-5" />
          </button>

          {profile ? (
            <>
              <ThemeToggle />

              <Link
                href="/messages"
                className={cn(
                  "relative p-2 rounded-xl transition-colors",
                  pathname.startsWith("/messages") ? "bg-[rgba(18,55,42,0.1)]" : "hover:bg-[var(--border)]"
                )}
                style={{ color: pathname.startsWith("/messages") ? "#12372A" : "var(--text-secondary)" }}
                aria-label={`Messages${unreadMessages > 0 ? `, ${unreadMessages} unread` : ""}`}
              >
                <MessageCircle className="w-5 h-5" />
                {unreadMessages > 0 && (
                  <span className="badge absolute -top-0.5 -right-0.5 text-[10px] min-w-[1.1rem] h-[1.1rem]">
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                )}
              </Link>

              <Link
                href="/notifications"
                className={cn(
                  "relative p-2 rounded-xl transition-colors",
                  pathname === "/notifications" ? "bg-[rgba(18,55,42,0.1)]" : "hover:bg-[var(--border)]"
                )}
                style={{ color: pathname === "/notifications" ? "#12372A" : "var(--text-secondary)" }}
                aria-label={`Notifications${unreadNotifications > 0 ? `, ${unreadNotifications} unread` : ""}`}
              >
                <Bell className="w-5 h-5" />
                {unreadNotifications > 0 && (
                  <span className="badge absolute -top-0.5 -right-0.5 text-[10px] min-w-[1.1rem] h-[1.1rem]">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </span>
                )}
              </Link>

              <Link
                href="/settings"
                className={cn(
                  "p-2 rounded-xl transition-colors",
                  pathname.startsWith("/settings") ? "bg-[rgba(18,55,42,0.1)]" : "hover:bg-[var(--border)]"
                )}
                style={{ color: pathname.startsWith("/settings") ? "#12372A" : "var(--text-secondary)" }}
                aria-label="Settings"
              >
                <Settings className="w-5 h-5" />
              </Link>

              <Link href={`/profile/${profile.username}`} className="ml-1" aria-label="My profile">
                <Avatar src={profile.avatar_url} name={profile.display_name} size={36} />
              </Link>
            </>
          ) : (
            <>
              <ThemeToggle />
              <Link href="/login" className="btn-ghost text-sm hidden sm:inline-flex">Log in</Link>
              <Link href="/register" className="btn-primary text-sm">Sign up</Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile search bar */}
      {searchOpen && (
        <div className="md:hidden px-4 pb-3 border-t" style={{ borderColor: "var(--border)" }}>
          <form onSubmit={handleSearch} className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-secondary)" }} />
            <input
              type="search"
              placeholder="Search…"
              autoFocus
              className="input pl-9 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search"
            />
          </form>
        </div>
      )}
    </header>
  );
}
