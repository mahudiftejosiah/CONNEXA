"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, ArrowLeft, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Logo } from "@/components/brand/Logo";

function VerifyContent() {
  const params = useSearchParams();
  const email = params.get("email") || "";
  const [resending, setResending] = useState(false);

  async function resend() {
    if (!email) return;
    setResending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/verify-email` },
    });
    setResending(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Verification email resent!");
  }

  return (
    <div className="card p-8 text-center">
      <div className="flex justify-center mb-6">
        <Logo size="md" variant="full" href="/" />
      </div>

      <div className="w-20 h-20 rounded-2xl bg-brand-green-800/10 dark:bg-brand-gold-400/10 flex items-center justify-center mx-auto mb-6">
        <Mail className="w-10 h-10 text-brand-green-800 dark:text-brand-gold-400" />
      </div>

      <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-2">Check your email</h1>
      <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-2">
        We sent a verification link to
      </p>
      {email && (
        <p className="font-semibold text-[var(--text-primary)] mb-4">{email}</p>
      )}
      <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-8">
        Click the link in the email to verify your account.
        Check your spam folder if you don&apos;t see it.
      </p>

      <div className="space-y-3">
        {email && (
          <button
            onClick={resend}
            disabled={resending}
            className="btn-ghost w-full flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${resending ? "animate-spin" : ""}`} />
            {resending ? "Resending…" : "Resend verification email"}
          </button>
        )}
        <Link href="/login" className="btn-primary w-full flex items-center justify-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </Link>
      </div>

      <p className="text-xs text-[var(--text-secondary)] mt-6">
        Wrong email?{" "}
        <Link href="/register" className="text-brand-green-800 dark:text-brand-gold-400 hover:underline">
          Start over
        </Link>
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="card p-8 h-80 animate-pulse" />}>
      <VerifyContent />
    </Suspense>
  );
}
