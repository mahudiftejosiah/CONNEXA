"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Users, Bell, Bookmark, Settings, LogOut,
  Compass, MessageCircle, Film, UsersRound, Shield,
  UserCircle, HelpCircle, Clapperboard, Gamepad2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import type { Profile } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  exact?: boolean;
}

interface SidebarProps {
  profile: Profile | null;
  unreadNotifications?: number;
  unreadMessages?: number;
  isAdmin?: boolean;
}

export function Sidebar({ profile, unreadNotifications = 0, unreadMessages = 0, isAdmin = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems: NavItem[] = [
    { href: "/feed",          label: "Home",          icon: <Home className="w-5 h-5" />,          exact: true },
    { href: "/friends",       label: "Friends",       icon: <Users className="w-5 h-5" /> },
    { href: "/messages",      label: "Messages",      icon: <MessageCircle className="w-5 h-5" />,  badge: unreadMessages },
    { href: "/notifications", label: "Notifications", icon: <Bell className="w-5 h-5" />,           badge: unreadNotifications },
    { href: "/stories",       label: "Stories",       icon: <Film className="w-5 h-5" /> },
    { href: "/reels",         label: "Reels",         icon: <Clapperboard className="w-5 h-5" /> },
    { href: "/games",         label: "Games",         icon: <Gamepad2 className="w-5 h-5" /> },
    { href: "/groups",        label: "Groups",        icon: <UsersRound className="w-5 h-5" /> },
    { href: "/discover",      label: "Discover",      icon: <Compass className="w-5 h-5" /> },
    { href: "/saved",         label: "Saved",         icon: <Bookmark className="w-5 h-5" /> },
  ];

  const bottomItems: NavItem[] = [
    ...(profile?.username ? [{ href: `/profile/${profile.username}`, label: "Profile", icon: <UserCircle className="w-5 h-5" /> }] : []),
    { href: "/settings",  label: "Settings", icon: <Settings className="w-5 h-5" /> },
    { href: "/help",      label: "Help",      icon: <HelpCircle className="w-5 h-5" /> },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: <Shield className="w-5 h-5" /> }] : []),
  ];

  function isActive(item: NavItem) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-16 bottom-0 w-64 border-r overflow-y-auto z-30"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex flex-col h-full p-3">
        {/* Profile mini */}
        {profile && (
          <Link
            href={`/profile/${profile.username}`}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--border)] transition-colors mb-2"
          >
            <Avatar src={profile.avatar_url} name={profile.display_name} size={40} />
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                {profile.display_name}
              </p>
              <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                @{profile.username}
              </p>
            </div>
          </Link>
        )}

        {/* Main nav */}
        <nav className="flex-1 space-y-0.5" aria-label="Main navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(isActive(item) ? "nav-link-active" : "nav-link")}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="badge">{item.badge > 99 ? "99+" : item.badge}</span>
              ) : null}
            </Link>
          ))}
        </nav>

        {/* Bottom nav */}
        <div className="pt-2 mt-2 space-y-0.5" style={{ borderTop: "1px solid var(--border)" }}>
          {bottomItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(isActive(item) ? "nav-link-active" : "nav-link")}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="nav-link w-full text-left"
            style={{ color: "#ef4444" }}
          >
            <LogOut className="w-5 h-5" />
            <span>Log out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
