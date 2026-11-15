import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProFrame } from "@/components/pro/ProFrame";
import { QuestionsBoard } from "./QuestionsBoard";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { featureEnabled, getProStatus } from "@/lib/pro";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Daily Questions" };

export default async function QuestionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [status, enabled] = await Promise.all([
    getProStatus(supabase, user.id),
    featureEnabled(supabase, "daily_questions"),
  ]);

  const { data, error } = await supabase.from("daily_questions")
    .select(`id, question, category, asked_on, created_at, author_id,
             replies:daily_question_replies(id, answer, user_id, created_at)`)
    .eq("published", true)
    .order("asked_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);

  const rows = (data ?? []) as unknown as {
    id: string; question: string; category: string | null; asked_on: string; created_at: string; author_id: string;
    replies: { id: string; answer: string; user_id: string; created_at: string }[];
  }[];

  return (
    <AppLayout>
      <ProFrame title="Daily Questions" pro={status.pro} expiresAt={status.expiresAt}
        subtitle="One prompt a day for the people who follow you. Answers are collected per person, so the same reply never lands twice.">
        {!enabled && (
          <ProDataNote>An administrator has switched Daily Questions off for everyone, so nothing new can be posted.</ProDataNote>
        )}
        {error && (
          <ProDataNote>Daily Questions needs migration 030 pasted in Supabase. Until then this board stays empty.</ProDataNote>
        )}
        {!error && rows.length === 0 && (
          <div className="card p-6 text-center space-y-2">
            <CalendarClock className="w-7 h-7 mx-auto" style={{ color: "var(--text-secondary)" }} />
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>No questions yet</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Ask the first one and it appears here for everyone with PRO.
            </p>
          </div>
        )}
        <QuestionsBoard questions={rows} currentUserId={user.id} canPost={status.pro && enabled} />
      </ProFrame>
    </AppLayout>
  );
}
