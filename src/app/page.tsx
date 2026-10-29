import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  Users, MessageCircle, Shield, Zap, Globe, Heart,
  ArrowRight, CheckCircle,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      {/* Top nav */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[var(--bg-card)]/80 backdrop-blur-md border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/login" className="btn-ghost text-sm hidden sm:inline-flex">Log in</Link>
            <Link href="/register" className="btn-primary text-sm">Get started</Link>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-brand-green-800 via-brand-green-700 to-brand-green-800 text-white">
          {/* Decorative circles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-brand-gold-400/10 blur-3xl" />
            <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-brand-gold-400/10 blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-white/5" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border border-white/5" />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 py-24 md:py-36 text-center">
            {/* Logo hero */}
            <div className="flex justify-center mb-8">
              <div className="w-24 h-24 rounded-3xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
                <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="7" fill="#12372A" />
                  <circle cx="24" cy="10" r="5" fill="#D6B875" opacity="0.9" />
                  <circle cx="36" cy="32" r="5" fill="#D6B875" opacity="0.7" />
                  <circle cx="12" cy="32" r="5" fill="#D6B875" opacity="0.7" />
                  <line x1="24" y1="15" x2="24" y2="17" stroke="#12372A" strokeWidth="2" strokeLinecap="round" />
                  <line x1="31.5" y1="28.5" x2="29.5" y2="27" stroke="#12372A" strokeWidth="2" strokeLinecap="round" />
                  <line x1="16.5" y1="28.5" x2="18.5" y2="27" stroke="#12372A" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="24" cy="24" r="21" stroke="#D6B875" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
                </svg>
              </div>
            </div>

            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
              Connect.{" "}
              <span className="text-brand-gold-400">Share.</span>
              {" "}Belong.
            </h1>
            <p className="text-xl md:text-2xl text-brand-green-100 max-w-2xl mx-auto mb-10 leading-relaxed">
              CONNEXA is where real connections happen — share your world, join communities,
              and build relationships that matter.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 bg-brand-gold-400 hover:bg-brand-gold-300 text-brand-green-800 font-bold px-8 py-4 rounded-2xl text-lg transition-all duration-200 shadow-lg hover:shadow-xl active:scale-[0.98]"
              >
                Create your account
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-semibold px-8 py-4 rounded-2xl text-lg transition-all duration-200 backdrop-blur"
              >
                Sign in
              </Link>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap justify-center gap-8 mt-16 pt-8 border-t border-white/10">
              {[
                { value: "Real", label: "Authentication" },
                { value: "E2E", label: "Privacy Controls" },
                { value: "Live", label: "Messaging" },
                { value: "24h", label: "Stories" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-3xl font-extrabold text-brand-gold-400">{s.value}</div>
                  <div className="text-sm text-brand-green-200 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-24 px-4 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-[var(--text-primary)] mb-4">
              Everything you need to connect
            </h2>
            <p className="text-lg text-[var(--text-secondary)] max-w-xl mx-auto">
              A complete social platform built with security, privacy, and real people at its core.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="card p-6 hover:shadow-md transition-shadow duration-200 group">
                <div className="w-12 h-12 rounded-2xl bg-brand-green-800/10 dark:bg-brand-gold-400/10 flex items-center justify-center mb-4 text-brand-green-800 dark:text-brand-gold-400 group-hover:scale-110 transition-transform duration-200">
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">{f.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Privacy section */}
        <section className="py-20 px-4 bg-brand-green-800/5 dark:bg-brand-gold-400/5">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-extrabold text-[var(--text-primary)] mb-4">
                  Your privacy, your rules
                </h2>
                <p className="text-[var(--text-secondary)] mb-6 leading-relaxed">
                  CONNEXA gives you complete control over who sees your content.
                  Every post can be Public, Friends-only, or Only Me.
                  Privacy is enforced server-side — not just hidden in the interface.
                </p>
                <ul className="space-y-3">
                  {privacyPoints.map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-brand-green-800 dark:text-brand-gold-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-[var(--text-secondary)]">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative">
                <div className="card p-6 space-y-4">
                  <h4 className="font-semibold text-[var(--text-primary)] text-sm uppercase tracking-wider">Post Visibility</h4>
                  {[
                    { label: "Public", desc: "Visible to everyone", icon: <Globe className="w-4 h-4" />, color: "text-blue-500" },
                    { label: "Friends", desc: "Only your connections", icon: <Users className="w-4 h-4" />, color: "text-brand-green-800 dark:text-brand-gold-400" },
                    { label: "Only Me", desc: "Completely private", icon: <Shield className="w-4 h-4" />, color: "text-purple-500" },
                  ].map((opt) => (
                    <div key={opt.label} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
                      <span className={opt.color}>{opt.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{opt.label}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{opt.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 px-4 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-4xl font-extrabold text-[var(--text-primary)] mb-4">
              Ready to join CONNEXA?
            </h2>
            <p className="text-lg text-[var(--text-secondary)] mb-10">
              Create your free account today and start building connections that last.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-brand-green-800 hover:bg-brand-green-700 text-white font-bold px-10 py-4 rounded-2xl text-lg transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Get started for free
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

const features = [
  {
    title: "Real Connections",
    icon: <Users className="w-6 h-6" />,
    description: "Send friend requests, follow people, and build a network of meaningful relationships with privacy-aware connection management.",
  },
  {
    title: "Rich Posts & Media",
    icon: <Heart className="w-6 h-6" />,
    description: "Share text, photos, and videos. React, comment, and engage with your network's content in a clean, distraction-free feed.",
  },
  {
    title: "Private Messaging",
    icon: <MessageCircle className="w-6 h-6" />,
    description: "Real-time one-to-one conversations with message history, unread indicators, and authorization enforced on the server.",
  },
  {
    title: "Stories",
    icon: <Zap className="w-6 h-6" />,
    description: "Share moments that last 24 hours. Stories expire automatically — enforced at the database level, not just the frontend.",
  },
  {
    title: "Groups & Communities",
    icon: <Globe className="w-6 h-6" />,
    description: "Create public or private groups. Private group content is protected at the data layer, not just behind a locked button.",
  },
  {
    title: "Secure by Design",
    icon: <Shield className="w-6 h-6" />,
    description: "Row-level security, server-side authorization, and no private data leaked through public queries or storage URLs.",
  },
];

const privacyPoints = [
  "Row Level Security enforced at the Postgres layer",
  "Block users and remove them from your world entirely",
  "Private storage buckets for sensitive media",
  "Server-side visibility checks — not just UI hiding",
  "No private content accessible via direct URLs",
];
