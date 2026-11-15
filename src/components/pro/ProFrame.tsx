"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Crown, Lock } from "lucide-react";
import { featuresInBucket } from "@/lib/pro-catalog";
import { cn } from "@/lib/utils";

// The PRO area keeps one navigation everywhere it goes. Entertainment is a
// dropdown rather than four more tabs, which is how the spec asks for it.
export function ProFrame({
  title,
  subtitle,
  pro,
  expiresAt,
  children,
}: {
  title: string;
  subtitle?: string;
  pro: boolean;
  expiresAt: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const community = featuresInBucket("community");
  const entertainment = featuresInBucket("entertainment");
  const creator = featuresInBucket("creator");

  const link = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      className={cn(
        "px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap border",
        pathname === href ? "border-transparent" : "hover:opacity-90"
      )}
      style={
        pathname === href
          ? { background: "var(--brand-gold)", color: "var(--brand-green)" }
          : { borderColor: "var(--border)", color: "var(--text-secondary)" }
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl p-5 space-y-3"
        style={{ background: "var(--brand-green)", color: "#fff" }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Crown className="w-5 h-5" style={{ color: "var(--brand-gold)" }} />
          <Link href="/pro" className="text-sm font-bold tracking-wide" style={{ color: "var(--brand-gold)" }}>
            CONNEXA PRO
          </Link>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }}>
            {pro ? "Active" : "Not active"}
          </span>
        </div>
        <h1 className="text-2xl font-extrabold leading-tight">{title}</h1>
        {subtitle && <p className="text-sm max-w-2xl" style={{ color: "rgba(255,255,255,0.78)" }}>{subtitle}</p>}
        {pro && expiresAt && (
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
            Renews or ends {new Date(expiresAt).toLocaleDateString()}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
        {link("/pro", "Membership")}
        {link("/pro/analytics", "Analytics")}
        {community.filter((f) => f.href).map((f) => link(f.href!, f.label))}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="menu"
            className="px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap border inline-flex items-center gap-1"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            Entertainment
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <div
              role="menu"
              className="absolute z-30 mt-1 w-56 rounded-xl border shadow-lg py-1"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              {entertainment.filter((f) => f.href).map((f) => (
                <Link
                  key={f.key}
                  href={f.href!}
                  role="menuitem"
                  className="flex items-start gap-2 px-3 py-2 text-sm hover:bg-[var(--border)]"
                  style={{ color: "var(--text-primary)" }}
                >
                  {!pro && <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "var(--text-secondary)" }} />}
                  <span>{f.label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        {creator.filter((f) => f.href).map((f) => link(f.href!, f.label))}
      </div>

      {children}
    </div>
  );
}
