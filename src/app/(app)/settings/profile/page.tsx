import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { EditProfileClient } from "./EditProfileClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Edit Profile" };

export default async function EditProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  const { data: prefs } = await supabase.from("user_preferences").select("*").eq("user_id", user.id).single();

  return (
    <AppLayout>
      <EditProfileClient profile={profile} preferences={prefs} />
    </AppLayout>
  );
}
