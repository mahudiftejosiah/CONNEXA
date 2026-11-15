import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProFrame } from "@/components/pro/ProFrame";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { PollsBoard } from "./PollsBoard";
import { featureEnabled, getProStatus } from "@/lib/pro";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Community Polls" };

export default async function PollsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [status, enabled] = await Promise.all([
    getProStatus(supabase, user.id),
    featureEnabled(supabase, "polls"),
  ]);

  const { data, error } = await supabase.from("polls")
    .select(`id, question, owner_id, closes_at, created_at,
             options:poll_options(id, label, position),
             votes:poll_votes(option_id, user_id)`)
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(30);

  const rows = (data ?? []) as unknown as {
    id: string; question: string; owner_id: string; closes_at: string | null; created_at: string;
    options: { id: string; label: string; position: number }[];
    votes: { option_id: string; user_id: string }[];
  }[];

  return (
    <AppLayout>
      <ProFrame title="Community Polls" pro={status.pro} expiresAt={status.expiresAt}
        subtitle="Choices, one vote per person, and the counts come straight from the votes table.">
        {!enabled && <ProDataNote tone="warn">An administrator has switched Community Polls off.</ProDataNote>}
        {error && <ProDataNote>Polls appear once migration 030 is pasted in Supabase.</ProDataNote>}
        <PollsBoard polls={rows} currentUserId={user.id} canVote={status.pro && enabled} canCreate={status.pro && enabled} />
      </ProFrame>
    </AppLayout>
  );
}
