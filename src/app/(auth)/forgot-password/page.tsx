"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Logo } from "@/components/brand/Logo";
import { CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    // Always show success to prevent email enumeration
    setSent(true);
  }

  if (sent) {
    return (
      <div className="card p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-green-800/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-brand-green-800 dark:text-brand-gold-400" />
        </div>
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-2">Check your email</h1>
        <p className="text-[var(--text-secondary)] mb-6 text-sm leading-relaxed">
          If an account exists for <strong className="text-[var(--text-primary)]">{email}</strong>,
          we&apos;ve sent a password reset link. Check your inbox and spam folder.
        </p>
        <Link href="/login" className="btn-primary inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-8">
      <div className="flex justify-center mb-6">
        <Logo size="md" variant="full" href="/" />
      </div>

      <h1 className="text-2xl font-extrabold text-[var(--text-primary)] text-center mb-1">Reset your password</h1>
      <p className="text-sm text-[var(--text-secondary)] text-center mb-8">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="Email address"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(""); }}
          error={error}
          icon={<Mail className="w-4 h-4" />}
          autoFocus
          required
        />
        <Button type="submit" loading={loading} className="w-full" size="lg">
          Send reset link
        </Button>
      </form>

      <p className="text-center text-sm text-[var(--text-secondary)] mt-6">
        Remembered it?{" "}
        <Link href="/login" className="text-brand-green-800 dark:text-brand-gold-400 font-semibold hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
