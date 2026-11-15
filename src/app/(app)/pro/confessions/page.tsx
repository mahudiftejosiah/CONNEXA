import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProFrame } from "@/components/pro/ProFrame";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { ConfessionWall } from "./ConfessionWall";
import { featureEnabled, getProStatus } from "@/lib/pro";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Anonymous Confessions" };

export default async function ConfessionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [status, enabled] = await Promise.all([
    getProStatus(supabase, user.id),
    featureEnabled(supabase, "confessions"),
  ]);

  const [{ data, error }, mine] = await Promise.all([
    supabase.from("confessions")
      .select("id, body, tag, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(60),
    // Only I can join my own confessions back to me; the wall never does.
    supabase.from("confession_authors").select("confession_id").eq("author_id", user.id),
  ]);

  const rows = (data ?? []) as unknown as { id: string; body: string; tag: string | null; created_at: string }[];
  const mineIds = new Set((mine?.data ?? []).map((m) => m.confession_id));
  const waiting = mineIds.size;

  return (
    <AppLayout>
      <ProFrame title="Anonymous Confessions" pro={status.pro} expiresAt={status.expiresAt}
        subtitle="What is said here carries no name, no avatar and no link to an account. Only a moderator can ever connect a confession to the person who sent it.">
        {!enabled && <ProDataNote tone="warn">An administrator has switched Anonymous Confessions off, so new ones cannot be sent.</ProDataNote>}
        {error && <ProDataNote>Confessions appear once migration 030 is pasted in Supabase.</ProDataNote>}

        <ConfessionWall
          confessions={rows}
          myIds={Array.from(mineIds)}
          waiting={waiting}
          canSend={status.pro && enabled}
        />
      </ProFrame>
    </AppLayout>
  );
}
