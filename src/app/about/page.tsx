import { Logo } from "@/components/brand/Logo";
import { Footer } from "@/components/layout/Footer";
import { Shield, Users, Heart, Globe } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "About CONNEXA" };

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto px-4 py-16 flex-1 w-full">
        <div className="flex justify-center mb-8"><Logo size="lg" href="/" /></div>
        <h1 className="text-4xl font-extrabold text-center text-[var(--text-primary)] mb-4">About CONNEXA</h1>
        <p className="text-center text-lg text-[var(--text-secondary)] mb-12">Connect. Share. Belong.</p>

        <div className="prose max-w-none space-y-6 text-[var(--text-secondary)]">
          <p className="text-base leading-relaxed">
            CONNEXA is a modern social networking platform built to bring people together through authentic connections,
            meaningful conversations, and vibrant communities — all in a secure, privacy-respecting environment.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 not-prose my-8">
            {[
              { icon: <Users className="w-6 h-6" />, title: "Real Connections", desc: "Friend requests, followers, and communities built on genuine relationships." },
              { icon: <Shield className="w-6 h-6" />, title: "Privacy First", desc: "Server-side enforcement of post visibility, RLS policies, and blocking controls." },
              { icon: <Heart className="w-6 h-6" />, title: "Meaningful Content", desc: "Share posts, stories, and reels with the people who matter most." },
              { icon: <Globe className="w-6 h-6" />, title: "Open Communities", desc: "Create or join public and private groups around your interests." },
            ].map((f) => (
              <div key={f.title} className="card p-4">
                <div className="text-brand-green-800 dark:text-brand-gold-400 mb-2">{f.icon}</div>
                <h3 className="font-semibold text-[var(--text-primary)] mb-1">{f.title}</h3>
                <p className="text-sm text-[var(--text-secondary)]">{f.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-base leading-relaxed">
            Built with Next.js, TypeScript, Tailwind CSS, and Supabase, CONNEXA is a full-stack platform
            designed with accessibility, performance, and security at its core.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
