"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, icon, children, className, disabled, ...props }, ref) => {
    const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";

    const variants = {
      primary:  "bg-brand-green-800 hover:bg-brand-green-700 text-white focus:ring-brand-green-800",
      secondary:"bg-brand-gold-400 hover:bg-brand-gold-500 text-brand-green-800 focus:ring-brand-gold-400",
      ghost:    "bg-transparent hover:bg-[var(--border)] text-[var(--text-primary)] focus:ring-brand-green-800",
      danger:   "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500",
      outline:  "bg-transparent border-2 border-brand-green-800 text-brand-green-800 hover:bg-brand-green-800 hover:text-white dark:border-brand-gold-400 dark:text-brand-gold-400 dark:hover:bg-brand-gold-400 dark:hover:text-brand-green-800 focus:ring-brand-green-800",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-5 py-2.5 text-sm",
      lg: "px-6 py-3 text-base",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
