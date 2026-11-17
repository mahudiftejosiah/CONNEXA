"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePro } from "@/lib/pro";
import { LIVE_BUCKET } from "@/lib/live";
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

  // Abuse prevention: anonymity makes this easy to spam, so a person gets a
  // short cooldown and a daily ceiling. Counted from the author table, which is
  // the only place their id appears.
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const [{ count: recent }, { count: today }] = await Promise.all([
    s.supabase.from("confession_authors").select("id", { count: "exact", head: true })
      .eq("author_id", s.user.id).gte("created_at", since),
    s.supabase.from("confession_authors").select("id", { count: "exact", head: true })
      .eq("author_id", s.user.id).gte("created_at", dayStart.toISOString()),
  ]);
  if ((recent ?? 0) >= 2) return { error: "Hold on — two confessions in ten minutes is enough. Try again shortly." };
  if ((today ?? 0) >= 10) return { error: "Ten confessions a day is the limit. Come back tomorrow." };

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

const REPORTABLE = ["confession", "poll", "question", "music", "event", "listing", "stream"] as const;
const REPORT_PAGE: Record<string, string> = {
  confession: "/pro/confessions", poll: "/pro/polls", question: "/pro/questions",
  music: "/pro/music", event: "/pro/events", listing: "/pro/marketplace", stream: "/live",
};

// Anything a PRO feature publishes can be flagged, and every flag lands in the
// same queue an administrator works through in Admin → PRO Management → Reports.
export async function reportPremiumItem(entityType: string, entityId: string, reason: string): Promise<{ error: string } | Said> {
  const s = await session();
  if ("error" in s) return s;
  if (!(REPORTABLE as readonly string[]).includes(entityType)) return { error: "That kind of thing cannot be reported." };
  if (!entityId) return { error: "Nothing was selected." };

  const text = reason.trim();
  if (text.length < 3) return { error: "Say what is wrong with it." };

  const { count: already } = await s.supabase.from("content_reports")
    .select("id", { count: "exact", head: true })
    .eq("reporter_id", s.user.id).eq("entity_id", entityId).eq("entity_type", entityType).eq("status", "pending");
  if ((already ?? 0) > 0) return { error: "You have already reported this and it is still waiting." };

  const { error } = await s.supabase.from("content_reports").insert({
    reporter_id: s.user.id,
    entity_id: entityId,
    entity_type: entityType as (typeof REPORTABLE)[number],
    reason: text.slice(0, 120),
    details: text.slice(0, 1000),
  });
  if (error) return { error: "That report could not be filed. Try again." };

  revalidatePath(REPORT_PAGE[entityType]);
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

/* ---------------- Music corner: member playlists ---------------- */

// The shelf itself is curated by the team, but a member may gather tracks from
// it into a playlist of their own and share what they like.
export async function createPlaylist(name: string, description?: string): Promise<{ error: string } | { success: true; id: string }> {
  const s = await session();
  if ("error" in s) return s;
  const locked = await gate(s.supabase, s.user.id, "music_corner");
  if (locked) return { error: locked };

  const title = name.trim();
  if (title.length < 2) return { error: "Give the playlist a name." };

  const { data, error } = await s.supabase.from("playlists")
    .insert({ owner_id: s.user.id, name: title.slice(0, 120), description: description?.trim() ? description.trim().slice(0, 500) : null })
    .select("id").single();
  if (error || !data) return needsTables(error, "playlists");

  revalidatePath("/pro/music");
  return { success: true, id: data.id };
}

export async function togglePlaylistTrack(playlistId: string, trackId: string): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const locked = await gate(s.supabase, s.user.id, "music_corner");
  if (locked) return { error: locked };

  const { data: mine } = await s.supabase.from("playlists").select("id").eq("id", playlistId).eq("owner_id", s.user.id).maybeSingle();
  if (!mine) return { error: "That playlist is not yours." };

  const { data: existing } = await s.supabase.from("playlist_tracks").select("id")
    .eq("playlist_id", playlistId).eq("track_id", trackId).maybeSingle();
  if (existing) {
    const { error } = await s.supabase.from("playlist_tracks").delete().eq("id", existing.id);
    if (error) return needsTables(error, "playlist_tracks");
    revalidatePath("/pro/music");
    return { success: true };
  }

  const { count } = await s.supabase.from("playlist_tracks").select("id", { count: "exact", head: true }).eq("playlist_id", playlistId);
  const { error } = await s.supabase.from("playlist_tracks")
    .insert({ playlist_id: playlistId, track_id: trackId, position: count ?? 0 });
  if (error) return needsTables(error, "playlist_tracks");

  revalidatePath("/pro/music");
  return { success: true };
}

export async function setPlaylistPublished(playlistId: string, published: boolean): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const { error } = await s.supabase.from("playlists")
    .update({ published }).eq("id", playlistId).eq("owner_id", s.user.id).select("id");
  if (error) return needsTables(error, "playlists");
  revalidatePath("/pro/music");
  return { success: true };
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

/* ---------------- Live broadcasts ---------------- */

// The database refuses a blocked account at insert time; this lets the page say
// so before anybody points a camera at themselves.
export async function canIBroadcast(): Promise<{ allowed: boolean; reason: string | null }> {
  const s = await session();
  if ("error" in s) return { allowed: false, reason: s.error };
  const locked = await gate(s.supabase, s.user.id, "live_streaming");
  if (locked) return { allowed: false, reason: locked };
  const { data, error } = await s.supabase.rpc("stream_allowed", { p_user: s.user.id });
  if (error || data !== false) return { allowed: true, reason: null };
  return { allowed: false, reason: "An administrator has paused broadcasting on your account." };
}

export async function scheduleStream(title: string, startsAt: string): Promise<{ error: string } | Said> {
  const s = await session();
  if ("error" in s) return s;
  const allowed = await canIBroadcast();
  if (!allowed.allowed) return { error: allowed.reason ?? "You cannot broadcast right now." };

  const name = title.trim();
  const when = new Date(startsAt);
  if (name.length < 3) return { error: "Give the broadcast a name." };
  if (Number.isNaN(when.getTime())) return { error: "Pick a date and time that makes sense." };
  if (when.getTime() < Date.now()) return { error: "A schedule has to be in the future." };

  const { error } = await s.supabase.from("live_sessions").insert({
    user_id: s.user.id,
    title: name.slice(0, 120),
    status: "scheduled",
    scheduled_at: when.toISOString(),
  });
  if (error) return { error: error.message.includes("scheduled") ? "Scheduling needs migration 033." : "That schedule could not be saved." };

  revalidatePath("/live");
  return { success: true, message: "Scheduled. It waits on your Go Live page until you start it." };
}

export async function cancelScheduledStream(sessionId: string): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const { data, error } = await s.supabase.from("live_sessions").delete()
    .eq("id", sessionId).eq("user_id", s.user.id).eq("status", "scheduled").select("id");
  if (error) return { error: "That schedule could not be removed." };
  if (!data?.length) return { error: "That schedule is no longer waiting." };
  revalidatePath("/live");
  return { success: true };
}

export async function sendLiveMessage(
  sessionId: string,
  body: string,
  kind: "message" | "reaction" = "message"
): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const text = body.trim();
  if (!text) return { error: "Say something first." };

  const { error } = await s.supabase.from("live_messages").insert({
    session_id: sessionId,
    user_id: s.user.id,
    kind,
    body: text.slice(0, 300),
  });
  if (error) {
    return { error: error.message.includes("live_messages") ? "Viewer chat needs migration 033." : "That message did not go through. The broadcast may have ended." };
  }
  return { success: true };
}

// One clip survives as the highlight the profile cover rolls afterwards; the
// rest of the rolling slices are cleared so the bucket does not grow forever.
export async function endLiveSession(sessionId: string, highlightPath: string | null): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;

  const { data, error } = await s.supabase.from("live_sessions").update({
    status: "ended",
    ended_at: new Date().toISOString(),
    highlight_path: highlightPath,
  }).eq("id", sessionId).eq("user_id", s.user.id).select("id");
  if (error) return { error: "The broadcast could not be closed." };
  if (!data?.length) return { error: "That broadcast is not yours." };

  const folder = `${s.user.id}/${sessionId}`;
  const { data: objects } = await s.supabase.storage.from(LIVE_BUCKET).list(folder, { limit: 200 });
  const stale = (objects ?? []).map((o) => `${folder}/${o.name}`).filter((p) => p !== highlightPath);
  if (stale.length) await s.supabase.storage.from(LIVE_BUCKET).remove(stale);

  revalidatePath("/live");
  return { success: true };
}

/* ---------------- Quiz battles: challenging a friend ---------------- */

export type DuelView = {
  id: string;
  quizId: string;
  quizTitle: string;
  status: "pending" | "accepted" | "declined" | "played" | "cancelled";
  requesterId: string;
  opponentId: string;
  requesterName: string;
  opponentName: string;
  requesterScore: number | null;
  opponentScore: number | null;
  requestedAt: string;
  finishedAt: string | null;
  side: "requester" | "opponent";
  played: boolean;
};

export async function listMyDuels(): Promise<{ error: string } | { duels: DuelView[] }> {
  const s = await session();
  if ("error" in s) return s;

  const { data, error } = await s.supabase.from("quiz_duels").select("*")
    .or(`requester_id.eq.${s.user.id},opponent_id.eq.${s.user.id}`)
    .order("requested_at", { ascending: false }).limit(40);
  if (error) return { error: "Friend challenges need migration 033." };

  const rows = data ?? [];
  const people = Array.from(new Set(rows.map((r) => r.requester_id).concat(rows.map((r) => r.opponent_id))));
  const quizIds = Array.from(new Set(rows.map((r) => r.quiz_id)));
  const [names, quizzes] = await Promise.all([
    s.supabase.from("profiles").select("id, username, display_name").in("id", people),
    s.supabase.from("quizzes").select("id, title").in("id", quizIds),
  ]);

  const nameOf = (id: string) => {
    const p = (names.data ?? []).find((x) => x.id === id);
    return p ? (p.display_name || p.username) : "Someone";
  };
  const titleOf = (id: string) => (quizzes.data ?? []).find((q) => q.id === id)?.title ?? "A quiz";

  return {
    duels: rows.map((r) => {
      const side: "requester" | "opponent" = r.requester_id === s.user.id ? "requester" : "opponent";
      const mine = side === "requester" ? r.requester_score : r.opponent_score;
      return {
        id: r.id,
        quizId: r.quiz_id,
        quizTitle: titleOf(r.quiz_id),
        status: r.status,
        requesterId: r.requester_id,
        opponentId: r.opponent_id,
        requesterName: nameOf(r.requester_id),
        opponentName: nameOf(r.opponent_id),
        requesterScore: r.requester_score,
        opponentScore: r.opponent_score,
        requestedAt: r.requested_at,
        finishedAt: r.finished_at,
        side,
        played: mine !== null,
      };
    }),
  };
}

export async function listQuizFriends(): Promise<{ error: string } | { friends: { id: string; name: string; username: string }[] }> {
  const s = await session();
  if ("error" in s) return s;
  const { data, error } = await s.supabase.from("friendships").select("user_id, friend_id")
    .or(`user_id.eq.${s.user.id},friend_id.eq.${s.user.id}`);
  if (error) return { error: "Your friends list could not be read." };

  const ids = Array.from(new Set((data ?? []).map((r) => (r.user_id === s.user.id ? r.friend_id : r.user_id))));
  if (!ids.length) return { friends: [] };
  const { data: people } = await s.supabase.from("profiles").select("id, username, display_name").in("id", ids).order("display_name");
  return { friends: (people ?? []).map((p) => ({ id: p.id, name: p.display_name || p.username, username: p.username })) };
}

export async function challengeToQuiz(quizId: string, opponentId: string): Promise<{ error: string } | Said> {
  const s = await session();
  if ("error" in s) return s;
  const locked = await gate(s.supabase, s.user.id, "quiz_battles");
  if (locked) return { error: locked };
  if (!opponentId || opponentId === s.user.id) return { error: "Pick somebody else to challenge." };

  const { data: quiz } = await s.supabase.from("quizzes").select("id, title").eq("id", quizId).eq("published", true).maybeSingle();
  if (!quiz) return { error: "That quiz is not open." };

  const { data: friend } = await s.supabase.from("friendships").select("id")
    .or(`and(user_id.eq.${s.user.id},friend_id.eq.${opponentId}),and(user_id.eq.${opponentId},friend_id.eq.${s.user.id})`)
    .limit(1).maybeSingle();
  if (!friend) return { error: "You can only challenge people on your friends list." };

  const { error } = await s.supabase.from("quiz_duels").insert({
    quiz_id: quizId, requester_id: s.user.id, opponent_id: opponentId,
  });
  if (error) return { error: error.message.includes("quiz_duels") ? "Friend challenges need migration 033." : "That challenge could not be sent." };

  revalidatePath("/pro/quizzes");
  return { success: true, message: `Challenge sent: ${quiz.title}.` };
}

export async function respondToDuel(duelId: string, accept: boolean): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const { data, error } = await s.supabase.from("quiz_duels")
    .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
    .eq("id", duelId).eq("opponent_id", s.user.id).eq("status", "pending").select("id");
  if (error) return { error: "That challenge could not be answered." };
  if (!data?.length) return { error: "That challenge is no longer waiting." };
  revalidatePath("/pro/quizzes");
  return { success: true };
}

export async function cancelDuel(duelId: string): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const { data, error } = await s.supabase.from("quiz_duels")
    .update({ status: "cancelled" })
    .eq("id", duelId).eq("requester_id", s.user.id).in("status", ["pending", "accepted"]).select("id");
  if (error) return { error: "That challenge could not be withdrawn." };
  if (!data?.length) return { error: "That challenge can no longer be withdrawn." };
  revalidatePath("/pro/quizzes");
  return { success: true };
}

// The score is written by a database function that only ever touches the
// caller's own column, so neither player can type in the other's result.
export async function recordDuelScore(duelId: string, score: number): Promise<
  { error: string } | { success: true; status: string; requesterScore: number | null; opponentScore: number | null }
> {
  const s = await session();
  if ("error" in s) return s;
  const { data, error } = await s.supabase.rpc("record_duel_score", {
    p_duel: duelId, p_score: Math.max(0, Math.floor(score)),
  });
  if (error) return { error: error.message.includes("record_duel_score") ? "Friend challenges need migration 033." : error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { error: "That challenge could not be scored." };
  revalidatePath("/pro/quizzes");
  return { success: true, status: row.status, requesterScore: row.requester_score, opponentScore: row.opponent_score };
}

/* ---------------- Events: invitations ---------------- */

export async function inviteToEvent(eventId: string, userIds: string[]): Promise<{ error: string } | Said> {
  const s = await session();
  if ("error" in s) return s;
  const locked = await gate(s.supabase, s.user.id, "events_hub");
  if (locked) return { error: locked };

  const { data: event } = await s.supabase.from("events").select("id, title").eq("id", eventId).eq("owner_id", s.user.id).maybeSingle();
  if (!event) return { error: "Only the host can invite people to an event." };

  const wanted = Array.from(new Set(userIds.filter((id) => !!id && id !== s.user.id))).slice(0, 50);
  if (!wanted.length) return { error: "Pick at least one person to invite." };

  const { data: already } = await s.supabase.from("event_invites").select("user_id").eq("event_id", eventId).in("user_id", wanted);
  const held = new Set((already ?? []).map((r) => r.user_id));
  const fresh = wanted.filter((id) => !held.has(id));
  if (!fresh.length) return { error: "Everyone you picked has already been invited." };

  const { error } = await s.supabase.from("event_invites").insert(
    fresh.map((id) => ({ event_id: eventId, user_id: id, invited_by: s.user.id }))
  );
  if (error) return { error: error.message.includes("event_invites") ? "Invitations need migration 033." : "Those invitations could not be sent." };

  revalidatePath("/pro/events");
  return { success: true, message: `${fresh.length} ${fresh.length === 1 ? "person" : "people"} invited to ${event.title}.` };
}

export async function respondToEventInvite(inviteId: string, status: "joined" | "dismissed"): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const { data, error } = await s.supabase.from("event_invites").update({ status })
    .eq("id", inviteId).eq("user_id", s.user.id).select("id, event_id");
  if (error) return { error: "That invitation could not be answered." };
  if (!data?.length) return { error: "That invitation is no longer there." };

  if (status === "joined") {
    await s.supabase.from("event_attendees")
      .upsert({ event_id: data[0].event_id, user_id: s.user.id, response: "going" }, { onConflict: "event_id,user_id" });
  }
  revalidatePath("/pro/events");
  return { success: true };
}

export type InviteView = {
  id: string; eventId: string; title: string; startsAt: string; location: string | null;
  hostName: string; status: "invited" | "joined" | "dismissed"; createdAt: string;
};

export async function listMyEventInvites(): Promise<{ error: string } | { invites: InviteView[] }> {
  const s = await session();
  if ("error" in s) return s;
  const { data, error } = await s.supabase.from("event_invites").select("*")
    .eq("user_id", s.user.id).neq("status", "dismissed")
    .order("created_at", { ascending: false }).limit(30);
  if (error) return { error: "Invitations need migration 033." };

  const rows = data ?? [];
  const ids = Array.from(new Set(rows.map((r) => r.event_id)));
  const { data: events } = await s.supabase.from("events").select("id, title, starts_at, location, owner_id").in("id", ids);
  const hosts = Array.from(new Set((events ?? []).map((e) => e.owner_id)));
  const { data: people } = await s.supabase.from("profiles").select("id, username, display_name").in("id", hosts);

  const invites: InviteView[] = [];
  rows.forEach((r) => {
    const e = (events ?? []).find((x) => x.id === r.event_id);
    if (!e) return;
    const host = (people ?? []).find((p) => p.id === e.owner_id);
    invites.push({
      id: r.id, eventId: e.id, title: e.title, startsAt: e.starts_at, location: e.location,
      hostName: host ? (host.display_name || host.username) : "The host",
      status: r.status, createdAt: r.created_at,
    });
  });
  return { invites };
}

export async function listEventInvitees(eventId: string): Promise<
  { error: string } | { invitees: { id: string; userId: string; name: string; username: string; status: string }[] }
> {
  const s = await session();
  if ("error" in s) return s;
  const { data: event } = await s.supabase.from("events").select("id").eq("id", eventId).eq("owner_id", s.user.id).maybeSingle();
  if (!event) return { error: "Only the host can see the guest list." };

  const { data, error } = await s.supabase.from("event_invites").select("*").eq("event_id", eventId).order("created_at");
  if (error) return { error: "Invitations need migration 033." };
  const ids = (data ?? []).map((r) => r.user_id);
  const { data: people } = await s.supabase.from("profiles").select("id, username, display_name").in("id", ids);

  return {
    invitees: (data ?? []).map((r) => {
      const p = (people ?? []).find((x) => x.id === r.user_id);
      return {
        id: r.id, userId: r.user_id,
        name: p ? (p.display_name || p.username) : "Someone",
        username: p?.username ?? "",
        status: r.status,
      };
    }),
  };
}

export async function withdrawEventInvite(inviteId: string): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const { data, error } = await s.supabase.from("event_invites").delete()
    .eq("id", inviteId).eq("invited_by", s.user.id).select("id");
  if (error) return { error: "That invitation could not be withdrawn." };
  if (!data?.length) return { error: "That invitation is not yours to withdraw." };
  revalidatePath("/pro/events");
  return { success: true };
}

/* ---------------- Profile visits: counting with consent ---------------- */

export async function setVisitActivityHidden(hidden: boolean): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const { error } = await s.supabase.from("profiles").update({ hide_visit_activity: hidden }).eq("id", s.user.id);
  if (error) return { error: "That preference needs migration 033." };
  revalidatePath("/settings");
  return { success: true };
}

// One visit per person per day, and never from somebody who opted out. The
// dashboard only ever reads totals, so no visitor is named to anybody.
export async function recordProfileVisit(profileId: string): Promise<{ error: string } | Empty> {
  const s = await session();
  if ("error" in s) return s;
  const { error } = await s.supabase.rpc("record_profile_visit", { p_profile: profileId });
  if (error) return { error: "Visit counting needs migration 033." };
  return { success: true };
}


