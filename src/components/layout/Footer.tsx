import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-brand-green-800 text-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <Logo size="md" className="mb-4 [&_span]:text-white" />
            <p className="text-brand-green-100 text-sm leading-relaxed max-w-sm">
              Connect. Share. Belong. CONNEXA brings people together through meaningful connections,
              shared experiences, and vibrant communities.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-semibold text-brand-gold-400 mb-3 text-sm uppercase tracking-wider">Company</h3>
            <ul className="space-y-2">
              {[
                { href: "/about",   label: "About" },
                { href: "/contact", label: "Contact" },
                { href: "/help",    label: "Help Center" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-brand-green-100 hover:text-brand-gold-400 text-sm transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-brand-gold-400 mb-3 text-sm uppercase tracking-wider">Legal</h3>
            <ul className="space-y-2">
              {[
                { href: "/privacy", label: "Privacy Policy" },
                { href: "/terms",   label: "Terms of Service" },
                { href: "/cookies", label: "Cookie Policy" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-brand-green-100 hover:text-brand-gold-400 text-sm transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-brand-green-700 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-brand-green-200 text-sm">
            © {year} CONNEXA. All rights reserved.
          </p>
          <p className="text-brand-green-300 text-xs">
            Connect. Share. Belong.
          </p>
        </div>
      </div>
    </footer>
  );
}
