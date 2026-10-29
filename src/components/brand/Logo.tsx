"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "full" | "icon";
  className?: string;
  href?: string;
}

const sizes = {
  sm: { icon: 28, text: "text-lg" },
  md: { icon: 36, text: "text-2xl" },
  lg: { icon: 48, text: "text-3xl" },
  xl: { icon: 64, text: "text-4xl" },
};

export function Logo({ size = "md", variant = "full", className, href = "/" }: LogoProps) {
  const s = sizes[size];

  const icon = (
    <svg
      width={s.icon}
      height={s.icon}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Central circle */}
      <circle cx="24" cy="24" r="7" fill="#12372A" />
      {/* Top circle */}
      <circle cx="24" cy="10" r="5" fill="#D6B875" opacity="0.9" />
      {/* Bottom-right circle */}
      <circle cx="36" cy="32" r="5" fill="#D6B875" opacity="0.7" />
      {/* Bottom-left circle */}
      <circle cx="12" cy="32" r="5" fill="#D6B875" opacity="0.7" />
      {/* Connecting lines */}
      <line x1="24" y1="15" x2="24" y2="17" stroke="#12372A" strokeWidth="2" strokeLinecap="round" />
      <line x1="31.5" y1="28.5" x2="29.5" y2="27" stroke="#12372A" strokeWidth="2" strokeLinecap="round" />
      <line x1="16.5" y1="28.5" x2="18.5" y2="27" stroke="#12372A" strokeWidth="2" strokeLinecap="round" />
      {/* Outer ring accent */}
      <circle cx="24" cy="24" r="21" stroke="#D6B875" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
    </svg>
  );

  const content = (
    <span className={cn("flex items-center gap-2 select-none", className)}>
      {icon}
      {variant === "full" && (
        <span className={cn("font-extrabold tracking-tight text-brand-green-800 dark:text-white", s.text)}>
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
