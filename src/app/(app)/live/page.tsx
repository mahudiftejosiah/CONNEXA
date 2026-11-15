import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { LiveClient } from "./LiveClient";
import { featureEnabled, getProStatus } from "@/lib/pro";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Go Live" };

export default async function LivePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  // Broadcasting is PRO. The database refuses it too (migration 029); this is
  // so the button can say something useful instead of failing.
  const [status, enabled] = await Promise.all([
    getProStatus(supabase, user.id),
    featureEnabled(supabase, "live_streaming"),
  ]);

  return (
    <AppLayout>
      <LiveClient profile={profile} canBroadcast={status.pro && enabled} />
    </AppLayout>
  );
}
