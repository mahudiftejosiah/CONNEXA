import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { getSiteContentMap, getGlobalTheme } from "@/lib/site";
import { SettingsClient } from "./SettingsClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, prefsRes, blocksRes, siteContent, globalTheme] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("user_preferences").select("*").eq("user_id", user.id).single(),
    supabase.from("user_blocks")
      .select("*, blocked:profiles!user_blocks_blocked_id_fkey(*)")
      .eq("blocker_id", user.id),
    getSiteContentMap(),
    getGlobalTheme(),
  ]);

  if (!profileRes.data) redirect("/login");

  return (
    <AppLayout>
      <SettingsClient
        profile={profileRes.data}
        preferences={prefsRes.data ?? null}
        blockedUsers={(blocksRes.data || []) as any}
        email={user.email || ""}
        siteContent={siteContent}
        globalTheme={globalTheme}
      />
    </AppLayout>
  );
}
