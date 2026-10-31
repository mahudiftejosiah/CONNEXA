import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-[var(--bg)]">
      {/* Animated backdrop */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="animate-float-orb absolute -top-24 -left-24 w-80 h-80 rounded-full bg-brand-green-800/15 dark:bg-brand-green-400/10 blur-3xl" />
        <div className="animate-float-orb absolute top-1/3 -right-28 w-96 h-96 rounded-full bg-brand-gold-400/20 dark:bg-brand-gold-400/10 blur-3xl" style={{ animationDelay: "-6s", animationDuration: "20s" }} />
        <div className="animate-float-orb absolute -bottom-32 left-1/4 w-80 h-80 rounded-full bg-blue-500/10 dark:bg-blue-400/10 blur-3xl" style={{ animationDelay: "-11s", animationDuration: "24s" }} />
      </div>

      <header className="relative z-10 h-16 flex items-center justify-between px-4 max-w-7xl mx-auto w-full">
        <Logo size="sm" />
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>

      <footer className="relative z-10 py-6 text-center text-xs text-[var(--text-secondary)]">
        <div className="flex flex-wrap justify-center gap-4 mb-2">
          <Link href="/privacy" className="hover:text-[var(--text-primary)] transition-colors">Privacy Policy</Link>
          <Link href="/terms"   className="hover:text-[var(--text-primary)] transition-colors">Terms of Service</Link>
          <Link href="/help"    className="hover:text-[var(--text-primary)] transition-colors">Help</Link>
        </div>
        <p>© {new Date().getFullYear()} CONNEXA</p>
        <p className="mt-1">Powered by DMFtech</p>
      </footer>
    </div>
  );
}
