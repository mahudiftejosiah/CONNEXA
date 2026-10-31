"use client";

import type { SiteShortcut } from "@/lib/supabase/types";

export function SiteIconGrid({ items }: { items: SiteShortcut[] }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
      {items.map((s) => (
        <a
          key={s.id}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          title={s.name}
          className="rounded-2xl border p-3 flex flex-col items-center gap-2 text-center transition-transform hover:scale-[1.03] active:scale-[0.98]"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <span
            className="relative w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 text-lg font-extrabold"
            style={{ backgroundColor: "var(--border)", color: "rgb(var(--a-800))" }}
          >
            {(s.name || s.url).charAt(0).toUpperCase()}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.logo_url || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(s.url.replace(/^https?:\/\//, "").split("/")[0])}&sz=64`}
              alt=""
              loading="lazy"
              className="absolute inset-0 m-auto w-9 h-9 object-contain"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </span>
          <span className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: "var(--text-primary)" }}>
            {s.name}
          </span>
        </a>
      ))}
    </div>
  );
}
