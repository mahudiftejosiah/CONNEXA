"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Compass, Gamepad2, UserCircle } from "lucide-react";

export function MobileNav({ username }: { username: string | null }) {
  const pathname = usePathname();

  // Messages and Notifications live in the header, and PRO lives in the
  // Verified tab of the profile, so the bar carries only these five.
  const items = [
    { href: "/feed",          label: "Home",    icon: <Home className="w-6 h-6" /> },
    { href: "/friends",       label: "Friends", icon: <Users className="w-6 h-6" /> },
    { href: "/discover",      label: "Discover",icon: <Compass className="w-6 h-6" /> },
    { href: "/games",         label: "Games",   icon: <Gamepad2 className="w-6 h-6" /> },
    ...(username ? [{ href: `/profile/${username}`, label: "Profile", icon: <UserCircle className="w-6 h-6" /> }] : []),
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      aria-label="Mobile navigation"
    >
      <div className="flex items-center h-16 px-1">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex-1 min-w-0 basis-0 flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl transition-colors"
              style={{ color: active ? "var(--brand-gold)" : "var(--text-secondary)" }}
              aria-label={item.label}
            >
              {item.icon}
              <span className="text-[10px] font-medium tracking-tight w-full text-center truncate leading-tight">
                {item.label}
              </span>
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
