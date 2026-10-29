"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Logo } from "@/components/brand/Logo";
import Link from "next/link";
import toast from "react-hot-toast";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ password: "", confirmPassword: "" });

  // Supabase puts the token in the URL hash — exchange it for a session
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        // Session is now active — user can set new password
      }
    });
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.password.length < 8) errs.password = "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword) errs.confirmPassword = "Passwords do not match.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: form.password });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setDone(true);
    setTimeout(() => router.push("/feed"), 2000);
  }

  if (done) {
    return (
      <div className="card p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-green-800/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-brand-green-800 dark:text-brand-gold-400" />
        </div>
        <h1 className="text-xl font-extrabold text-[var(--text-primary)] mb-2">Password updated!</h1>
        <p className="text-sm text-[var(--text-secondary)]">Redirecting you to your feed…</p>
      </div>
    );
  }

  return (
    <div className="card p-8">
      <div className="flex justify-center mb-6">
        <Logo size="md" variant="full" href="/" />
      </div>

      <h1 className="text-2xl font-extrabold text-[var(--text-primary)] text-center mb-1">Set new password</h1>
      <p className="text-sm text-[var(--text-secondary)] text-center mb-8">Choose a strong password for your account.</p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="relative">
          <Input
            label="New password"
            type={showPass ? "text" : "password"}
            placeholder="8+ characters"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            error={errors.password}
            icon={<Lock className="w-4 h-4" />}
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPass((s) => !s)}
            className="absolute right-3 top-8 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label={showPass ? "Hide" : "Show"}
          >
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <Input
          label="Confirm new password"
          type={showPass ? "text" : "password"}
          placeholder="Repeat your password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
          error={errors.confirmPassword}
          icon={<Lock className="w-4 h-4" />}
        />

        <Button type="submit" loading={loading} className="w-full" size="lg">
          Update password
        </Button>
      </form>

      <p className="text-center text-sm text-[var(--text-secondary)] mt-6">
        <Link href="/login" className="text-brand-green-800 dark:text-brand-gold-400 hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="card p-8 h-80 animate-pulse" />}>
      <ResetForm />
    </Suspense>
  );
}
