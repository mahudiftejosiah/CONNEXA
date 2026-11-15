import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProFrame } from "@/components/pro/ProFrame";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { QuizBattles } from "./QuizBattles";
import { listPlayableQuizzes } from "@/lib/actions/pro";
import { featureEnabled, getProStatus } from "@/lib/pro";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live Quiz Battles" };

export default async function QuizzesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [status, enabled] = await Promise.all([
    getProStatus(supabase, user.id),
    featureEnabled(supabase, "quiz_battles"),
  ]);

  const listed = await listPlayableQuizzes();
  const quizzes = "quizzes" in listed ? listed.quizzes : [];

  return (
    <AppLayout>
      <ProFrame title="Live Quiz Battles" pro={status.pro} expiresAt={status.expiresAt}
        subtitle="Timed rounds built by the CONNEXA team. Your score is worked out in the database, so the answer key never reaches the browser.">
        {!enabled && <ProDataNote tone="warn">An administrator has switched Live Quiz Battles off.</ProDataNote>}
        <QuizBattles
          initialQuizzes={quizzes}
          canPlay={status.pro && enabled}
          note={"error" in listed ? listed.error : null}
        />
      </ProFrame>
    </AppLayout>
  );
}
