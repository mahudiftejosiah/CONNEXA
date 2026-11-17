import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Fingerprint, Lock } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { HashingBot } from "@/app/admin/HashingBot";
import { getHashingSettings } from "@/lib/hashing-settings";
import { supportedAlgorithms } from "@/lib/hashing";
import { getProStatus } from "@/lib/pro";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Hashing Bot" };
export const dynamic = "force-dynamic";

export default async function HashingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, settings] = await Promise.all([
    supabase.from("profiles").select("is_admin").eq("id", user.id).single(),
    getHashingSettings(supabase),
  ]);
  if (!profile) redirect("/login");

  const status = await getProStatus(supabase, user.id);
  const isAdmin = !!profile.is_admin;
  const permitted = isAdmin || settings.audience === "all" || (settings.audience === "pro" && status.pro);

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--brand-green)" }}>
            <Fingerprint className="w-5 h-5" style={{ color: "var(--brand-gold)" }} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{settings.title}</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{settings.description}</p>
          </div>
        </div>

        {!settings.enabled ? (
          <div className="card p-5">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              An administrator has switched the hashing bot off. Nothing can be processed until it is switched back on.
            </p>
          </div>
        ) : !settings.visible ? (
          <div className="card p-5">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              The hashing bot is not published right now.
            </p>
          </div>
        ) : !permitted ? (
          <div className="card p-5 space-y-3">
            <p className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
              <Lock className="w-4 h-4" style={{ color: "var(--brand-gold-text)" }} />
              {settings.audience === "pro" ? "CONNEXA PRO members only" : "Administrators only"}
            </p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {settings.audience === "pro"
                ? "The hashing bot is part of CONNEXA PRO. Upgrade to turn text into a hash and to check a hash against text you already hold."
                : "An administrator has limited the hashing bot to administrators. Ask them to widen who may use it."}
            </p>
            {settings.audience === "pro" && (
              <Link href="/pro#upgrade" className="btn-primary inline-flex text-sm">Upgrade to CONNEXA PRO</Link>
            )}
          </div>
        ) : (
          <HashingBot settings={settings} algorithms={supportedAlgorithms()} manage={false} />
        )}

        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Hashes are one-way. This tool never guesses, cracks or recovers a password, and it stores no text and no hash —
          only a count of how many operations ran.
        </p>
      </div>
    </AppLayout>
  );
}