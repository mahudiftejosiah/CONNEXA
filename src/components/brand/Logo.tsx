"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  variant?: "full" | "icon";
  className?: string;
  href?: string;
}

const sizes = {
  sm: { icon: 28, text: "text-lg" },
  md: { icon: 36, text: "text-2xl" },
  lg: { icon: 48, text: "text-3xl" },
  xl: { icon: 64, text: "text-4xl" },
  "2xl": { icon: 104, text: "text-5xl" },
};

function Emblem() {
  return (
    <svg className="logo3d__emblem" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <line x1="24" y1="15" x2="24" y2="18" stroke="rgb(var(--a-200))" strokeWidth="2" strokeLinecap="round" />
      <line x1="31.5" y1="28.5" x2="28.5" y2="26.5" stroke="rgb(var(--a-200))" strokeWidth="2" strokeLinecap="round" />
      <line x1="16.5" y1="28.5" x2="19.5" y2="26.5" stroke="rgb(var(--a-200))" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="24" r="7" fill="rgb(var(--b-300))" />
      <circle cx="24" cy="10" r="5" fill="rgb(var(--a-100))" />
      <circle cx="36" cy="32" r="5" fill="rgb(var(--a-100))" opacity="0.82" />
      <circle cx="12" cy="32" r="5" fill="rgb(var(--a-100))" opacity="0.82" />
      <circle cx="24" cy="24" r="21" stroke="rgb(var(--b-400))" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.45" />
    </svg>
  );
}

export function Logo({ size = "md", variant = "full", className, href = "/" }: LogoProps) {
  const s = sizes[size];

  const icon = (
    <span
      className="logo3d"
      style={{ "--logo3d": `${s.icon}px`, width: s.icon, height: s.icon } as CSSProperties}
      aria-hidden="true"
    >
      <span className="logo3d__halo" />
      <span className="logo3d__tilt">
        <span className="logo3d__orbit" />
        <span className="logo3d__gyro">
          {[0, 1, 2, 3].map((face) => (
            <span key={face} className={cn("logo3d__panel", face > 0 && `logo3d__panel--${face}`)}>
              <Emblem />
              <span className="logo3d__sheen" style={{ animationDelay: `${face * -2.25 - 0.45}s` }} />
            </span>
          ))}
        </span>
      </span>
    </span>
  );

  const content = (
    <span className={cn("flex items-center gap-2 select-none", className)}>
      {icon}
      {variant === "full" && (
        <span className={cn("logo3d__word font-extrabold tracking-tight text-brand-green-800 dark:text-white", s.text)}>
          CONN<span className="text-brand-gold-400">EXA</span>
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="flex items-center focus:outline-none focus:ring-2 focus:ring-brand-gold-400 rounded-lg">
        {content}
      </Link>
    );
  }

  return content;
}
