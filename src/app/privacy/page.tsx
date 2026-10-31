import { Footer } from "@/components/layout/Footer";
import { Logo } from "@/components/brand/Logo";
import { getSiteContentMap } from "@/lib/site";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default async function PrivacyPage() {
  const content = (await getSiteContentMap())["privacy"];
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto px-4 py-16 flex-1 w-full">
        <div className="flex justify-center mb-8"><Logo size="md" href="/" /></div>
        <h1 className="text-3xl font-extrabold text-[var(--text-primary)] mb-2">{content?.title || "Privacy Policy"}</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-8">Last updated: {content ? new Date(content.updated_at).toLocaleDateString() : "October 2026"}</p>
        {content ? (
          <div className="card p-6 text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{content.body}</div>
        ) : (
        <div className="card p-6 space-y-6 text-sm text-[var(--text-secondary)] leading-relaxed">
          {[
            { title: "1. Information We Collect", body: "We collect information you provide directly (name, email, profile details, posts, messages) and information generated through your use of the platform (activity logs, device information)." },
            { title: "2. How We Use Your Information", body: "We use your information to provide and improve the platform, personalise your experience, send notifications you've opted into, and enforce our community standards." },
            { title: "3. Sharing of Information", body: "We do not sell your personal data. Content you post is visible according to the visibility settings you choose (Public, Friends, Only Me). Private content is enforced at the database level." },
            { title: "4. Data Security", body: "We use industry-standard security measures including encrypted connections, row-level security policies, and server-side authorization checks to protect your data." },
            { title: "5. Your Rights", body: "You can edit or delete your account and content at any time. You can request full data deletion through the account settings page. We will process requests within 30 days." },
            { title: "6. Cookies", body: "We use essential cookies for authentication session management. No third-party tracking cookies are used without your consent." },
            { title: "7. Contact", body: "For privacy enquiries, contact us via the Help page." },
          ].map((s) => (
            <div key={s.title}>
              <h2 className="font-semibold text-[var(--text-primary)] mb-1">{s.title}</h2>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
