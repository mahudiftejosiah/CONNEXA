import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReelsStage } from "@/components/reels/ReelsViewer";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reels" };

export default async function ReelsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The reel list itself comes from /api/reels inside the player, so the page
  // only needs the viewer's own profile for the comment box.
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return <ReelsStage profile={profile} />;
}
