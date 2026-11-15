"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePro } from "@/lib/pro";
import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<Database>;

// Each writer answers with one of these two shapes, and the union is spelled out
// rather than inferred: TypeScript widens an inferred union with optional
// undefined keys, which quietly breaks the "error" in result check every caller
// relies on to tell a refusal from a success.
type Session = { supabase: Client; user: { id: string } };
type Empty = { success: true };
type Said = { success: true; message: string };

// Every writer below re-reads the account on the server. Hiding a button in the
// browser is a courtesy; this is the actual lock.
async function session(): Promise<Session | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." as const };
  return { supabase, user };
}

async function gate(supabase: Client, userId: string, feature: string) {
  const res = await requirePro(supabase, userId, feature);
  return "error" in res ? res.error : null;
}

function needsTables(error: unknown, path: string) {
  return { error: `Could not save that. The CONNEXA PRO tables appear when migration 030 is pasted (${path}).` };
}

/* ---------------- Daily questions ---------------- */

export async function askDailyQuestion(question: string, category?: string): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const locked = await gate(s.supabase, s.user.id, "daily_questions");
  if (locked) return { error: locked };

  const text = question.trim();
  if (text.length < 3) return { error: "Write at least a few words of question." };
  if (text.length > 300) return { error: "Keep the question under 300 characters." };

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await s.supabase.from("daily_questions").insert({
    author_id: s.user.id,
    question: text,
    category: category?.trim() ? category.trim().slice(0, 40) : null,
    asked_on: today,
  });
  if (error) return needsTables(error, "daily_questions");

  revalidatePath("/pro/questions");
  return { success: true };
}

export async function answerDailyQuestion(questionId: string, answer: string): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const locked = await gate(s.supabase, s.user.id, "daily_questions");
  if (locked) return { error: locked };

  const text = answer.trim();
  if (!text) return { error: "Type an answer first." };
  if (text.length > 500) return { error: "Keep the answer under 500 characters." };

  const { error } = await s.supabase.from("daily_question_replies")
    .upsert({ question_id: questionId, user_id: s.user.id, answer: text }, { onConflict: "question_id,user_id" });
  if (error) return needsTables(error, "daily_question_replies");

  revalidatePath("/pro/questions");
  return { success: true };
}

export async function retireDailyQuestion(questionId: string): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const { error } = await s.supabase.from("daily_questions")
    .update({ published: false }).eq("id", questionId).eq("author_id", s.user.id).select("id");
  if (error) return needsTables(error, "daily_questions");
  revalidatePath("/pro/questions");
  return { success: true };
}

/* ---------------- Anonymous confessions ---------------- */

export async function submitConfession(body: string, tag?: string): Promise<{ error: string } | Said> {
  const s = await session();
  if ("error" in s) return s;
  const locked = await gate(s.supabase, s.user.id, "confessions");
  if (locked) return { error: locked };

  const text = body.trim();
  if (text.length < 5) return { error: "A confession needs at least five characters." };
  if (text.length > 1500) return { error: "Keep it under 1500 characters." };

  // The public row carries no name. Who wrote it is stored in a table only the
  // writer and an administrator can read.
  const { data: confession, error } = await s.supabase.from("confessions")
    .insert({ body: text, tag: tag?.trim() ? tag.trim().slice(0, 40) : null })
    .select("id").single();
  if (error || !confession) return needsTables(error, "confessions");

  const { error: authorError } = await s.supabase.from("confession_authors")
    .insert({ confession_id: confession.id, author_id: s.user.id });
  if (authorError) {
    await s.supabase.from("confessions").delete().eq("id", confession.id);
    return needsTables(authorError, "confession_authors");
  }

  revalidatePath("/pro/confessions");
  return { success: true, message: "Sent. It appears once an administrator approves it." };
}

export async function reportConfession(confessionId: string, reason: string): Promise<{ error: string } | Said> {
  const s = await session();
  if ("error" in s) return s;
  const text = reason.trim();
  if (text.length < 3) return { error: "Say what is wrong with it." };

  const { error } = await s.supabase.from("content_reports").insert({
    reporter_id: s.user.id,
    entity_id: confessionId,
    entity_type: "confession",
    reason: text.slice(0, 120),
    details: text,
  });
  if (error) return { error: "That report could not be filed. Try again." };

  revalidatePath("/pro/confessions");
  return { success: true, message: "Reported to the moderators." };
}

/* ---------------- Community polls ---------------- */

export async function createPoll(question: string, options: string[], closesInHours?: number): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const locked = await gate(s.supabase, s.user.id, "polls");
  if (locked) return { error: locked };

  const text = question.trim();
  const choices = options.map((o) => o.trim()).filter(Boolean);
  if (text.length < 3) return { error: "Write the question you want answered." };
  if (choices.length < 2) return { error: "A poll needs at least two choices." };
  if (choices.length > 6) return { error: "Six choices is the maximum." };
  if (choices.some((o) => o.length > 120)) return { error: "Each choice must be under 120 characters." };

  const { data: poll, error } = await s.supabase.from("polls").insert({
    owner_id: s.user.id,
    question: text,
    closes_at: closesInHours && closesInHours > 0
      ? new Date(Date.now() + closesInHours * 3600_000).toISOString()
      : null,
  }).select("id").single();
  if (error || !poll) return needsTables(error, "polls");

  const { error: optionError } = await s.supabase.from("poll_options").insert(
    choices.map((label, i) => ({ poll_id: poll.id, label, position: i }))
  );
  if (optionError) {
    await s.supabase.from("polls").delete().eq("id", poll.id);
    return needsTables(optionError, "poll_options");
  }

  revalidatePath("/pro/polls");
  return { success: true };
}

export async function votePoll(pollId: string, optionId: string): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const locked = await gate(s.supabase, s.user.id, "polls");
  if (locked) return { error: locked };

  const { error } = await s.supabase.from("poll_votes")
    .insert({ poll_id: pollId, option_id: optionId, user_id: s.user.id });
  if (error) {
    if (error.code === "23505") return { error: "You have already voted on this poll." };
    return needsTables(error, "poll_votes");
  }
  revalidatePath("/pro/polls");
  return { success: true };
}

export async function closePoll(pollId: string): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const { error } = await s.supabase.from("polls")
    .update({ published: false }).eq("id", pollId).eq("owner_id", s.user.id).select("id");
  if (error) return needsTables(error, "polls");
  revalidatePath("/pro/polls");
  return { success: true };
}

/* ---------------- Live quiz battles ---------------- */

export type PlayableQuestion = { id: string; prompt: string; options: string[] };

// The answer key stays in the database; open_quiz() hands out prompts only.
export async function fetchQuiz(quizId: string): Promise<
  { error: string } | { timeLimit: number; questions: PlayableQuestion[] }
> {
  const s = await session();
  if ("error" in s) return s;
  const locked = await gate(s.supabase, s.user.id, "quiz_battles");
  if (locked) return { error: locked };

  const [questions, quiz] = await Promise.all([
    s.supabase.rpc("open_quiz", { p_quiz: quizId }),
    s.supabase.from("quizzes").select("time_limit_seconds").eq("id", quizId).eq("published", true).maybeSingle(),
  ]);
  if (questions.error) return { error: "Quiz battles need migration 031." };
  if (!quiz.data) return { error: "That quiz is not open right now." };

  return {
    timeLimit: quiz.data.time_limit_seconds,
    questions: (questions.data ?? []).map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: Array.isArray(q.options) ? q.options.map(String) : [],
    })),
  };
}

export async function listPlayableQuizzes(): Promise<
  { error: string } | { quizzes: { id: string; title: string; description: string | null; category: string | null; difficulty: string; time_limit_seconds: number; questions: number; best: number | null; attempts: number }[] }
> {
  const s = await session();
  if ("error" in s) return s;

  const [open, mine] = await Promise.all([
    s.supabase.rpc("list_open_quizzes"),
    s.supabase.from("quiz_attempts").select("quiz_id, score, total").eq("user_id", s.user.id),
  ]);
  if (open.error) return { error: "Quiz battles need migration 031." };

  const history = new Map<string, { best: number; attempts: number }>();
  for (const a of mine.data ?? []) {
    const prev = history.get(a.quiz_id) ?? { best: 0, attempts: 0 };
    history.set(a.quiz_id, { best: Math.max(prev.best, a.score), attempts: prev.attempts + 1 });
  }

  return {
    quizzes: (open.data ?? []).map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      category: q.category,
      difficulty: q.difficulty,
      time_limit_seconds: q.time_limit_seconds,
      questions: Number(q.questions ?? 0),
      best: history.get(q.id)?.best ?? null,
      attempts: history.get(q.id)?.attempts ?? 0,
    })),
  };
}

export async function finishQuiz(quizId: string, answers: { choice: number }[], secondsUsed: number): Promise<{ error: string } | { success: true; score: number; total: number; results: unknown }> {
  const s = await session();
  if ("error" in s) return s;
  const locked = await gate(s.supabase, s.user.id, "quiz_battles");
  if (locked) return { error: locked };

  const { data, error } = await s.supabase.rpc("grade_quiz_attempt", {
    p_quiz: quizId,
    p_answers: answers,
    p_seconds: Math.max(0, Math.floor(secondsUsed)),
  });
  if (error) return { error: error.message.includes("grade_quiz_attempt") ? "Quiz grading needs migration 031." : error.message };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { error: "That quiz has no questions yet." };
  revalidatePath("/pro/quizzes");
  return { success: true, score: Number(row.score), total: Number(row.total), results: row.results };
}

/* ---------------- Events hub ---------------- */

export async function createEvent(input: {
  title: string; description?: string; startsAt: string; location?: string; category?: string; coverPath?: string;
}): Promise<{ error: string } | Said> {
  const s = await session();
  if ("error" in s) return s;
  const locked = await gate(s.supabase, s.user.id, "events_hub");
  if (locked) return { error: locked };

  const title = input.title.trim();
  const startsAt = new Date(input.startsAt);
  if (title.length < 3) return { error: "Give the event a name." };
  if (Number.isNaN(startsAt.getTime())) return { error: "Pick a date and time that makes sense." };

  const { error } = await s.supabase.from("events").insert({
    owner_id: s.user.id,
    title: title.slice(0, 160),
    description: input.description?.trim() ? input.description.trim().slice(0, 2000) : null,
    starts_at: startsAt.toISOString(),
    location: input.location?.trim() ? input.location.trim().slice(0, 200) : null,
    category: input.category?.trim() ? input.category.trim().slice(0, 60) : null,
    cover_path: input.coverPath ?? null,
  });
  if (error) return needsTables(error, "events");

  revalidatePath("/pro/events");
  return { success: true, message: "Event published. It is live on the Events Hub." };
}

export async function rsvpEvent(eventId: string, response: "going" | "maybe" | "declined"): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const { error } = await s.supabase.from("event_attendees")
    .upsert({ event_id: eventId, user_id: s.user.id, response }, { onConflict: "event_id,user_id" });
  if (error) return needsTables(error, "event_attendees");
  revalidatePath("/pro/events");
  return { success: true };
}

/* ---------------- Marketplace ---------------- */

export async function createListing(input: {
  kind: "product" | "service"; title: string; description?: string; price?: number; currency?: string;
  category?: string; contact?: string; imagePaths?: string[];
}): Promise<{ error: string } | Said> {
  const s = await session();
  if ("error" in s) return s;
  const locked = await gate(s.supabase, s.user.id, "marketplace");
  if (locked) return { error: locked };

  const title = input.title.trim();
  if (title.length < 3) return { error: "Name what you are offering." };
  if (input.price !== undefined && input.price !== null && (!Number.isFinite(input.price) || input.price < 0)) {
    return { error: "A price has to be zero or more." };
  }

  const { error } = await s.supabase.from("listings").insert({
    owner_id: s.user.id,
    kind: input.kind,
    title: title.slice(0, 160),
    description: input.description?.trim() ? input.description.trim().slice(0, 2000) : null,
    price: input.price ?? null,
    currency: (input.currency ?? "NGN").toUpperCase().slice(0, 3),
    category: input.category?.trim() ? input.category.trim().slice(0, 60) : null,
    contact: input.contact?.trim() ? input.contact.trim().slice(0, 200) : null,
    image_paths: input.imagePaths ?? [],
  });
  if (error) return needsTables(error, "listings");

  revalidatePath("/pro/marketplace");
  return { success: true, message: "Sent for review. An admin approves listings before anyone sees them." };
}

export async function withdrawListing(listingId: string): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const { error } = await s.supabase.from("listings")
    .update({ status: "removed" }).eq("id", listingId).eq("owner_id", s.user.id).select("id");
  if (error) return needsTables(error, "listings");
  revalidatePath("/pro/marketplace");
  return { success: true };
}

/* ---------------- Shared premium uploads ---------------- */

// One bucket for every PRO file, under a folder named after the uploader, so
// the existing storage policies decide who may write there.
export async function uploadProMedia(formData: FormData): Promise<{ error: string } | { path: string; url: string }> {
  const s = await session();
  if ("error" in s) return s;

  const file = formData.get("file");
  const folder = String(formData.get("folder") ?? "misc").replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "misc";
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first." };
  if (file.size > 25 * 1024 * 1024) return { error: "That file is over 25 MB." };

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${s.user.id}/${folder}/${Date.now()}-${safeName}`;
  const { error } = await s.supabase.storage.from("pro-media").upload(path, file, { upsert: false });
  if (error) {
    return { error: error.message.includes("Bucket not found") ? "Uploads need migration 031 (the pro-media bucket)." : "That upload was refused." };
  }
  const { data } = s.supabase.storage.from("pro-media").getPublicUrl(path);
  return { path, url: data.publicUrl };
}

/* ---------------- Badges and view tracking ---------------- */

export async function refreshMyBadges(): Promise<{ error: string; earned: string[] } | { success: true; earned: string[] }> {
  const s = await session();
  if ("error" in s) return { error: s.error, earned: [] };
  const { data, error } = await s.supabase.rpc("refresh_user_badges", { p_user: s.user.id });
  if (error) return { error: "Badges need migration 031.", earned: [] as string[] };
  // The function returns one row per badge name it just awarded.
  return { success: true, earned: (data ?? []).map((row) => row.awarded) };
}


