import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <header className="h-16 flex items-center justify-between px-4 max-w-7xl mx-auto w-full">
        <Logo size="sm" />
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-[var(--text-secondary)]">
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
