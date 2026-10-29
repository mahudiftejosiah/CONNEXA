"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, User, Mail, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Logo } from "@/components/brand/Logo";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    agreeTerms: false,
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.fullName.trim() || form.fullName.trim().length < 2) e.fullName = "Full name must be at least 2 characters.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email address.";
    if (form.password.length < 8) e.password = "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match.";
    if (!form.agreeTerms) e.agreeTerms = "You must agree to the terms.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: {
        data: { full_name: form.fullName.trim() },
        emailRedirectTo: `${window.location.origin}/verify-email`,
      },
    });

    setLoading(false);

    if (error) {
      if (error.message.includes("already registered") || error.message.includes("already exists")) {
        setErrors({ email: "An account with this email already exists." });
      } else {
        toast.error(error.message);
      }
      return;
    }

    router.push("/verify-email?email=" + encodeURIComponent(form.email));
  }

  return (
    <div className="card p-8">
      <div className="flex justify-center mb-6">
        <Logo size="md" variant="full" href="/" />
      </div>

      <h1 className="text-2xl font-extrabold text-[var(--text-primary)] text-center mb-1">Create your account</h1>
      <p className="text-sm text-[var(--text-secondary)] text-center mb-8">Join CONNEXA and start connecting today</p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="Full name"
          type="text"
          placeholder="Your name"
          autoComplete="name"
          value={form.fullName}
          onChange={set("fullName")}
          error={errors.fullName}
          icon={<User className="w-4 h-4" />}
          required
        />

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
        />

        <div className="relative">
          <Input
            label="Password"
            type={showPass ? "text" : "password"}
            placeholder="8+ characters"
            autoComplete="new-password"
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

        <Input
          label="Confirm password"
          type={showPass ? "text" : "password"}
          placeholder="Repeat your password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={set("confirmPassword")}
          error={errors.confirmPassword}
          icon={<Lock className="w-4 h-4" />}
          required
        />

        <div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.agreeTerms}
              onChange={set("agreeTerms")}
              className="mt-0.5 w-4 h-4 accent-brand-green-800 cursor-pointer"
            />
            <span className="text-sm text-[var(--text-secondary)]">
              I agree to the{" "}
              <Link href="/terms" className="text-brand-green-800 dark:text-brand-gold-400 hover:underline font-medium">Terms of Service</Link>
              {" "}and{" "}
              <Link href="/privacy" className="text-brand-green-800 dark:text-brand-gold-400 hover:underline font-medium">Privacy Policy</Link>
            </span>
          </label>
          {errors.agreeTerms && <p className="mt-1 text-sm text-red-500">{errors.agreeTerms}</p>}
        </div>

        <Button type="submit" loading={loading} className="w-full" size="lg">
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-[var(--text-secondary)] mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-brand-green-800 dark:text-brand-gold-400 font-semibold hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
