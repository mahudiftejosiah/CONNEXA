import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { LiveClient } from "./LiveClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Go Live" };

export default async function LivePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  return (
    <AppLayout>
      <LiveClient profile={profile} />
    </AppLayout>
  );
}
