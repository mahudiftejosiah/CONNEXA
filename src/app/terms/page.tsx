import { Footer } from "@/components/layout/Footer";
import { Logo } from "@/components/brand/Logo";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto px-4 py-16 flex-1 w-full">
        <div className="flex justify-center mb-8"><Logo size="md" href="/" /></div>
        <h1 className="text-3xl font-extrabold text-[var(--text-primary)] mb-2">Terms of Service</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-8">Last updated: October 2026</p>
        <div className="card p-6 space-y-6 text-sm text-[var(--text-secondary)] leading-relaxed">
          {[
            { title: "1. Acceptance", body: "By creating an account or using CONNEXA, you agree to these Terms of Service." },
            { title: "2. Your Account", body: "You are responsible for keeping your account secure. Do not share your password. You must be at least 13 years old to create an account." },
            { title: "3. Content Rules", body: "Do not post illegal, harmful, hateful, or deceptive content. Do not harass other users. Content that violates these rules may be removed and your account suspended." },
            { title: "4. Intellectual Property", body: "You retain ownership of content you post. By posting, you grant CONNEXA a licence to display your content in accordance with your visibility settings." },
            { title: "5. Privacy", body: "Use of CONNEXA is also governed by our Privacy Policy." },
            { title: "6. Termination", body: "We reserve the right to suspend or terminate accounts that violate these terms." },
            { title: "7. Limitation of Liability", body: "CONNEXA is provided as-is. We are not liable for indirect damages arising from your use of the platform." },
            { title: "8. Changes", body: "We may update these terms. Continued use of the platform after changes constitutes acceptance." },
          ].map((s) => (
            <div key={s.title}>
              <h2 className="font-semibold text-[var(--text-primary)] mb-1">{s.title}</h2>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
