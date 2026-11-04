import { LogOut, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Logo } from "@/components/brand/Logo";
import { adminSignOut, enterPublicSite } from "@/lib/actions/adminView";
import type { Profile } from "@/lib/supabase/types";

interface AdminShellProps {
  profile: Profile;
  children: React.ReactNode;
}

/**
 * The admin panel's own chrome: deliberately free of the public navigation
 * (Navbar, Sidebar, MobileNav) so nothing an admin does here can drift out
 * into the feed. The only ways out are the two buttons in this header.
 */
export function AdminShell({ profile, children }: AdminShellProps) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--bg)" }}>
      <header
        className="fixed top-0 left-0 right-0 z-40 h-16 border-b"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Logo size="sm" variant="icon" href="/admin" />
            <span className="hidden sm:inline font-extrabold tracking-tight text-lg" style={{ color: "var(--text-primary)" }}>
              CONNEXA
            </span>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: "var(--brand-gold)", color: "#12372A" }}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden md:inline text-sm font-medium truncate max-w-[10rem]" style={{ color: "var(--text-secondary)" }}>
              {profile.display_name}
            </span>
            <Avatar src={profile.avatar_url} name={profile.display_name} size={32} />

            <form action={enterPublicSite}>
              <button
                type="submit"
                className="text-sm font-semibold px-3 py-1.5 rounded-full border transition-colors hover:opacity-80 whitespace-nowrap"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                Enter public site
              </button>
            </form>

            <form action={adminSignOut}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80 whitespace-nowrap"
                style={{ backgroundColor: "var(--brand-green)", color: "#ffffff" }}
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-16">
        <div className="max-w-7xl mx-auto px-4 py-6">{children}</div>
      </main>
    </div>
  );
}
