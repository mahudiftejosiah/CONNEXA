import { Footer } from "@/components/layout/Footer";
import { Logo } from "@/components/brand/Logo";
import { HelpCircle, MessageCircle, Shield, User, Lock } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Help Center" };

const faqs = [
  { q: "How do I change my profile photo?", a: "Go to Settings → Edit Profile. Click your current avatar photo to upload a new one." },
  { q: "Who can see my posts?", a: "When creating a post, choose Public (everyone), Friends (connections only), or Only Me (private). This is enforced server-side." },
  { q: "How do I delete my account?", a: "Go to Settings → Danger Zone and click 'Request account deletion'. The process takes up to 30 days." },
  { q: "How do I block someone?", a: "Visit their profile and use the menu to block them. Blocked users cannot see your content and cannot contact you." },
  { q: "Why did my story disappear?", a: "Stories automatically expire after 24 hours. This is enforced at the database level." },
  { q: "How do I report inappropriate content?", a: "Click the ⋯ menu on any post, comment, or profile and select 'Report'. Our moderation team will review it." },
  { q: "Can I reset my password?", a: "Yes — on the login page, click 'Forgot password?' and we'll email you a reset link." },
  { q: "How do private groups work?", a: "Private groups require an invitation. Non-members cannot see the group's content even if they know the URL." },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto px-4 py-16 flex-1 w-full">
        <div className="flex justify-center mb-8"><Logo size="md" href="/" /></div>
        <h1 className="text-3xl font-extrabold text-center text-[var(--text-primary)] mb-2">Help Center</h1>
        <p className="text-center text-[var(--text-secondary)] mb-12">Find answers to common questions about CONNEXA.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {[
            { icon: <User className="w-5 h-5" />, title: "Account & Profile" },
            { icon: <Lock className="w-5 h-5" />, title: "Privacy & Safety" },
            { icon: <MessageCircle className="w-5 h-5" />, title: "Messaging" },
            { icon: <Shield className="w-5 h-5" />, title: "Reporting" },
          ].map((c) => (
            <div key={c.title} className="card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-green-800/10 flex items-center justify-center text-brand-green-800 dark:text-brand-gold-400">
                {c.icon}
              </div>
              <span className="font-semibold text-[var(--text-primary)]">{c.title}</span>
            </div>
          ))}
        </div>

        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">Frequently Asked Questions</h2>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <details key={i} className="card p-4 cursor-pointer group">
              <summary className="flex items-center justify-between gap-3 font-semibold text-[var(--text-primary)] list-none">
                <span>{faq.q}</span>
                <HelpCircle className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />
              </summary>
              <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
