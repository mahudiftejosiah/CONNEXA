"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Compass, Bell, MessageCircle, Gamepad2, UserCircle } from "lucide-react";
import { useUnreadCounts } from "./UnreadProvider";

export function MobileNav({ username }: { username: string | null }) {
  const pathname = usePathname();
  const { notifications: unreadNotifications, messages: unreadMessages } = useUnreadCounts();

  const items = [
    { href: "/feed",          label: "Home",    icon: <Home className="w-6 h-6" /> },
    { href: "/friends",       label: "Friends", icon: <Users className="w-6 h-6" /> },
    { href: "/discover",      label: "Discover",icon: <Compass className="w-6 h-6" /> },
    { href: "/games",         label: "Games",   icon: <Gamepad2 className="w-6 h-6" /> },
    { href: "/messages",      label: "Messages",icon: <MessageCircle className="w-6 h-6" />, badge: unreadMessages },
    { href: "/notifications", label: "Notifications", icon: <Bell className="w-6 h-6" />,    badge: unreadNotifications },
    ...(username ? [{ href: `/profile/${username}`, label: "Profile", icon: <UserCircle className="w-6 h-6" /> }] : []),
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors min-w-[3rem]"
              style={{ color: active ? "var(--brand-gold)" : "var(--text-secondary)" }}
              aria-label={item.label}
            >
              {item.icon}
              <span className="text-[10px] font-medium">{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="badge absolute top-0 right-1 text-[9px] min-w-[1rem] h-4">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              ) : null}
              {active && (
                <span
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ backgroundColor: "var(--brand-gold)" }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
