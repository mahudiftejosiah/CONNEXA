import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { StudyReader } from "@/components/study/StudyReader";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Study Room" };

export default async function StudyBookPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: book } = await supabase
    .from("study_books")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!book) notFound();

  // Null simply means no marker yet — including when migration 018 is not
  // applied, so the book still opens.
  const { data: progress } = await supabase
    .from("study_progress")
    .select("position, percent")
    .eq("user_id", user.id)
    .eq("book_id", book.id)
    .maybeSingle();

  return (
    <AppLayout>
      <StudyReader
        book={book}
        userId={user.id}
        saved={progress ? { position: progress.position, percent: progress.percent } : null}
      />
    </AppLayout>
  );
}
