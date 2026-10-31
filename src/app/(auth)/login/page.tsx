"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Logo } from "@/components/brand/Logo";
import { safeRedirectPath } from "@/lib/utils";
import toast from "react-hot-toast";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = safeRedirectPath(params.get("redirectTo"));

  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ email: "", password: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.email) errs.email = "Email is required.";
    if (!form.password) errs.password = "Password is required.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });
    setLoading(false);

    if (error) {
      if (error.message.toLowerCase().includes("invalid")) {
        setErrors({ password: "Invalid email or password." });
      } else if (error.message.toLowerCase().includes("confirm")) {
        toast.error("Please verify your email before logging in.");
      } else {
        toast.error(error.message);
      }
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="card p-8 stagger-in">
      <div className="flex justify-center mb-6">
        <div className="animate-glow-pulse rounded-2xl">
          <Logo size="md" variant="full" href="/" />
        </div>
      </div>

      <h1 className="text-2xl font-extrabold text-[var(--text-primary)] text-center mb-1">Welcome back</h1>
      <p className="text-sm text-[var(--text-secondary)] text-center mb-8">Sign in to your CONNEXA account</p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="Email address"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={form.email}
          onChange={set("email")}
          error={errors.email}
          icon={<Mail className="w-4 h-4" />}
          required
          autoFocus
        />

        <div className="relative">
          <Input
            label="Password"
            type={showPass ? "text" : "password"}
            placeholder="Your password"
            autoComplete="current-password"
            value={form.password}
            onChange={set("password")}
            error={errors.password}
            icon={<Lock className="w-4 h-4" />}
            required
          />
          <button
            type="button"
            onClick={() => setShowPass((s) => !s)}
            className="absolute right-3 top-8 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label={showPass ? "Hide password" : "Show password"}
          >
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm text-brand-green-800 dark:text-brand-gold-400 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={loading} className="w-full" size="lg">
          Sign in
        </Button>
      </form>

      <p className="text-center text-sm text-[var(--text-secondary)] mt-6">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-brand-green-800 dark:text-brand-gold-400 font-semibold hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="card p-8 animate-pulse h-96" />}>
      <LoginForm />
    </Suspense>
  );
}
