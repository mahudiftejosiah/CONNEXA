import { Footer } from "@/components/layout/Footer";
import { Logo } from "@/components/brand/Logo";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cookie Policy" };

export default function CookiesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto px-4 py-16 flex-1 w-full">
        <div className="flex justify-center mb-8"><Logo size="md" href="/" /></div>
        <h1 className="text-3xl font-extrabold text-[var(--text-primary)] mb-2">Cookie Policy</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-8">Last updated: October 2026</p>
        <div className="card p-6 space-y-6 text-sm text-[var(--text-secondary)] leading-relaxed">
          <p>CONNEXA uses cookies solely for session management. We set a single first-party cookie to keep you signed in between page visits. We do not use advertising, tracking, or analytics cookies.</p>
          <p>You can clear cookies at any time via your browser settings. Doing so will sign you out of CONNEXA.</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
