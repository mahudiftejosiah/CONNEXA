"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, Save, Trophy, Search, Swords } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";
import { db, useRows, useNames, usePager, Field, Panel, Notice, Stat, Switch, Pager, audit } from "./useRows";
import toast from "react-hot-toast";

type Quiz = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  time_limit_seconds: number;
  published: boolean;
  created_at: string;
};

type Question = {
  id: string;
  quiz_id: string;
  prompt: string;
  options: string[];
  position: number;
};

type AnswerKey = { question_id: string; correct_index: number };

type Attempt = { id: string; quiz_id: string; user_id: string; score: number; total: number; seconds_used: number; created_at: string };

type Duel = {
  id: string;
  quiz_id: string;
  requester_id: string;
  opponent_id: string;
  status: "pending" | "accepted" | "declined" | "played" | "cancelled";
  requester_score: number | null;
  opponent_score: number | null;
  requested_at: string;
  finished_at: string | null;
};

const DIFFICULTIES: Quiz["difficulty"][] = ["easy", "medium", "hard", "mixed"];
const DUEL_STATUSES: Duel["status"][] = ["pending", "accepted", "played", "declined", "cancelled"];

export function ProQuizzes({ adminId: passedAdminId }: { adminId?: string }) {
  const adminId = useAdminId(passedAdminId);
  const names = useNames();
  const quizzes = useRows<Quiz>("quizzes", { order: "created_at" });
  const questions = useRows<Question>("quiz_questions", { order: "position", ascending: true });
  const keys = useRows<AnswerKey>("quiz_answers");
  const attempts = useRows<Attempt>("quiz_attempts", { order: "created_at" });
  const duels = useRows<Duel>("quiz_duels", { order: "requested_at" });
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newQuiz, setNewQuiz] = useState({ title: "", description: "", category: "", difficulty: "mixed" as Quiz["difficulty"], time_limit_seconds: "300" });
  const [resultQuery, setResultQuery] = useState("");
  const [duelStatus, setDuelStatus] = useState("all");

  const questionsOf = (quizId: string) => questions.rows.filter((q) => q.quiz_id === quizId);
  const titleOf = (quizId: string) => quizzes.rows.find((q) => q.id === quizId)?.title ?? "A quiz that was deleted";
  const scoreLine = (userId: string, score: number | null) =>
    `${names[userId] ? `@${names[userId]}` : "Unknown player"} ${score === null ? "has not played" : `scored ${score}`}`;
  const statsOf = (quizId: string) => {
    const list = attempts.rows.filter((a) => a.quiz_id === quizId);
    if (list.length === 0) return null;
    const pct = list.reduce((s, a) => s + (a.total > 0 ? a.score / a.total : 0), 0) / list.length;
    return { plays: list.length, avg: Math.round(pct * 100), best: Math.max(...list.map((a) => a.score)), last: list[0].created_at };
  };

  const needle = resultQuery.trim().toLowerCase().replace(/^@/, "");
  const resultRows = attempts.rows.filter((a) => !needle
    || (names[a.user_id] ?? "").toLowerCase().includes(needle)
    || titleOf(a.quiz_id).toLowerCase().includes(needle));
  const pagedResults = usePager(resultRows, 15);

  const duelRows = duels.rows.filter((d) => duelStatus === "all" || d.status === duelStatus);
  const pagedDuels = usePager(duelRows, 15);

  const graded = attempts.rows.filter((a) => a.total > 0);
  const average = graded.length === 0 ? null : Math.round((graded.reduce((s, a) => s + a.score / a.total, 0) / graded.length) * 100);
  const players = new Set(attempts.rows.map((a) => a.user_id)).size;
  const duelsPlayed = duels.rows.filter((d) => d.status === "played").length;
  // A missing table is a named notice, never a zero that reads like a real count.
  const duelNotice = duels.error
    ? (duels.error.includes("not in the database yet")
      ? "Friend challenges need migration 033 — the quiz_duels table is not in the database yet."
      : duels.error)
    : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Quizzes" value={quizzes.rows.length} />
        <Stat label="Published" value={quizzes.rows.filter((q) => q.published).length} />
        <Stat label="Questions written" value={questions.rows.length} />
        <Stat label="Attempts played" value={attempts.rows.length} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Distinct players" value={players} />
        <Stat label="Average score" value={average === null ? "—" : `${average}%`} />
        <Stat label="Duels played" value={duelNotice ? "—" : duelsPlayed} />
        <Stat label="Challenges on file" value={duelNotice ? "—" : duels.rows.length} />
      </div>

      <Panel title="Create a quiz battle" hint="Questions are stored apart from their answers, and only this console can read the answer key — a player never receives the correct option.">
        <Notice text={quizzes.error} />
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Title *"><input className="input" value={newQuiz.title} onChange={(e) => setNewQuiz({ ...newQuiz, title: e.target.value })} /></Field>
          <Field label="Category"><input className="input" placeholder="History, Science, Football…" value={newQuiz.category} onChange={(e) => setNewQuiz({ ...newQuiz, category: e.target.value })} /></Field>
          <Field label="Difficulty">
            <select className="input" value={newQuiz.difficulty} onChange={(e) => setNewQuiz({ ...newQuiz, difficulty: e.target.value as Quiz["difficulty"] })}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Time limit (seconds, 30–3600)">
            <input className="input" inputMode="numeric" value={newQuiz.time_limit_seconds}
              onChange={(e) => setNewQuiz({ ...newQuiz, time_limit_seconds: e.target.value.replace(/\D/g, "") })} />
          </Field>
        </div>
        <Field label="Description"><input className="input" value={newQuiz.description} onChange={(e) => setNewQuiz({ ...newQuiz, description: e.target.value })} /></Field>
        <Button icon={<Plus className="w-4 h-4" />} onClick={async () => {
          const seconds = Number(newQuiz.time_limit_seconds);
          if (newQuiz.title.trim().length < 2) { toast.error("Give the quiz a title."); return; }
          if (!(seconds >= 30 && seconds <= 3600)) { toast.error("The time limit must be between 30 and 3600 seconds."); return; }
          const { data, error } = await db().from("quizzes").insert({
            title: newQuiz.title.trim(),
            description: newQuiz.description.trim() || null,
            category: newQuiz.category.trim() || null,
            difficulty: newQuiz.difficulty,
            time_limit_seconds: seconds,
            published: false,
          }).select().single();
          if (error || !data) { toast.error("Could not create: " + (error?.message ?? "paste migration 031")); return; }
          quizzes.set((p) => [data as Quiz, ...p]);
          await audit(adminId, {
            entityId: (data as Quiz).id, entityType: "quiz", action: "quiz_created",
            reason: `Created “${newQuiz.title.trim()}” · ${newQuiz.difficulty} · ${seconds}s · left unpublished.`,
          });
          setNewQuiz({ title: "", description: "", category: "", difficulty: "mixed", time_limit_seconds: "300" });
          setOpen((data as Quiz).id);
          toast.success("Quiz created — add its questions. It stays hidden until you publish it.");
        }}>Create quiz</Button>
      </Panel>

      <Panel title="Quiz battles" hint="Publishing decides who can play. Participation numbers come from real graded attempts.">
        {quizzes.loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : quizzes.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No quizzes yet.</p>
        ) : (
          <div className="space-y-2">
            {quizzes.rows.map((q) => {
              const stats = statsOf(q.id);
              const expanded = open === q.id;
              return (
                <div key={q.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-main)" }}>
                  <div className="flex flex-wrap items-center gap-3 p-3">
                    <Trophy className="w-4 h-4 text-[var(--brand-gold)] flex-shrink-0" />
                    <div className="flex-1 min-w-[10rem]">
                      <p className="font-semibold text-sm">{q.title}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {questionsOf(q.id).length} questions · {q.difficulty}
                        {q.category ? ` · ${q.category}` : ""} · {q.time_limit_seconds}s
                        {stats ? ` · played ${stats.plays}× , avg ${stats.avg}%` : " · not played yet"}
                      </p>
                    </div>
                    <Switch on={q.published} label={q.title} onChange={async (v) => {
                      setBusy(q.id);
                      const { error } = await db().from("quizzes").update({ published: v }).eq("id", q.id);
                      setBusy(null);
                      if (error) { toast.error("Could not change that."); return; }
                      quizzes.set((p) => p.map((x) => (x.id === q.id ? { ...x, published: v } : x)));
                      await audit(adminId, {
                        entityId: q.id, entityType: "quiz",
                        action: v ? "quiz_published" : "quiz_unpublished",
                        reason: `“${q.title}” ${v ? "opened to" : "withdrawn from"} PRO members.`,
                      });
                      toast.success(v ? "Open to PRO members." : "Withdrawn from the list.");
                    }} />
                    <Button size="sm" variant="ghost" onClick={() => setOpen(expanded ? null : q.id)}
                      icon={expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}>
                      {expanded ? "Close" : "Edit"}
                    </Button>
                    <Button size="sm" variant="ghost" loading={busy === q.id} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      onClick={async () => {
                        const written = questionsOf(q.id).length;
                        if (!confirm(`Delete “${q.title}” and its ${written} questions? Graded attempts stay in the history.`)) return;
                        if (await quizzes.drop("id", q.id)) {
                          questions.set((p) => p.filter((x) => x.quiz_id !== q.id));
                          await audit(adminId, {
                            entityId: q.id, entityType: "quiz", action: "quiz_deleted",
                            reason: `Deleted “${q.title}” and its ${written} questions.`,
                          });
                          toast.success("Quiz deleted.");
                        }
                      }}>
                      Delete
                    </Button>
                  </div>

                  {expanded && (
                    <div className="p-3 pt-0 space-y-3 border-t" style={{ borderColor: "var(--border)" }}>
                      <QuizEditor quiz={q} adminId={adminId} onSave={(values) => quizzes.patch("id", q.id, values)} />
                      {questionsOf(q.id).map((question, index) => (
                        <QuestionEditor key={question.id} index={index} question={question} adminId={adminId}
                          correctIndex={keys.rows.find((k) => k.question_id === question.id)?.correct_index ?? -1}
                          onSaved={(next, correct) => {
                            questions.set((p) => p.map((x) => (x.id === next.id ? next : x)));
                            keys.set((p) => {
                              const rest = p.filter((k) => k.question_id !== next.id);
                              return [...rest, { question_id: next.id, correct_index: correct }];
                            });
                          }}
                          onDeleted={(id) => {
                            questions.set((p) => p.filter((x) => x.id !== id));
                            keys.set((p) => p.filter((k) => k.question_id !== id));
                          }} />
                      ))}
                      <AddQuestion quizId={q.id} existing={questionsOf(q.id).length} adminId={adminId}
                        onAdded={(question, correct) => {
                          questions.set((p) => [...p, question]);
                          keys.set((p) => [...p, { question_id: question.id, correct_index: correct }]);
                        }} />
                      {stats && (
                        <p className="text-xs text-[var(--text-secondary)]">
                          {stats.plays} attempt(s), average score {stats.avg}%, best {stats.best}, last played {formatRelativeTime(stats.last)}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Player results" hint="One row per graded attempt: who played, which quiz, the score the database gave them, how long they took and when. Searching moves the display only — the counts above still describe every attempt.">
        <Notice text={attempts.error} />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <input type="search" className="input pl-9 text-sm" placeholder="Search by @username or quiz title…"
            value={resultQuery} onChange={(e) => setResultQuery(e.target.value)} aria-label="Search quiz results" />
        </div>
        {attempts.loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : resultRows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            {attempts.rows.length === 0 ? "Nobody has played a quiz yet." : "No attempt matches that search."}
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              {pagedResults.shown.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5 rounded-xl text-sm" style={{ backgroundColor: "var(--bg-main)" }}>
                  <span className="font-semibold truncate max-w-[10rem]" style={{ color: "var(--text-primary)" }}>
                    {names[a.user_id] ? `@${names[a.user_id]}` : "Unknown player"}
                  </span>
                  <span className="flex-1 min-w-[8rem] truncate text-xs" style={{ color: "var(--text-secondary)" }}>{titleOf(a.quiz_id)}</span>
                  <span className="text-xs font-bold" style={{ color: "var(--brand-gold-text)" }}>
                    {a.score}/{a.total}{a.total > 0 ? ` · ${Math.round((a.score / a.total) * 100)}%` : ""}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{a.seconds_used}s</span>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{formatRelativeTime(a.created_at)}</span>
                </div>
              ))}
            </div>
            <Pager page={pagedResults.page} pages={pagedResults.pages} total={pagedResults.total} goTo={pagedResults.goTo} singular="attempt" />
          </>
        )}
      </Panel>

      <Panel title="Friend challenges" hint="Duels between two PRO members. Each score is written by a database function for the player who earned it, so neither side can enter the other result.">
        <Notice text={duelNotice} />
        {!duelNotice && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input w-auto" value={duelStatus} onChange={(e) => setDuelStatus(e.target.value)} aria-label="Challenge status">
                <option value="all">Every status</option>
                {DUEL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Button size="sm" variant="ghost" onClick={() => void duels.reload()}>Check again</Button>
            </div>
            {duels.loading ? (
              <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
            ) : duelRows.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                {duels.rows.length === 0 ? "No member has challenged a friend yet." : "No challenge has that status."}
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  {pagedDuels.shown.map((d) => (
                    <div key={d.id} className="p-2.5 rounded-xl space-y-1" style={{ backgroundColor: "var(--bg-main)" }}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <Swords className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--brand-gold)" }} />
                        <span className="font-semibold flex-1 min-w-[8rem] truncate" style={{ color: "var(--text-primary)" }}>{titleOf(d.quiz_id)}</span>
                        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--brand-gold-text)" }}>{d.status}</span>
                      </div>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {scoreLine(d.requester_id, d.requester_score)} · {scoreLine(d.opponent_id, d.opponent_score)}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        Challenged {formatRelativeTime(d.requested_at)}
                        {d.finished_at ? ` · finished ${formatRelativeTime(d.finished_at)}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
                <Pager page={pagedDuels.page} pages={pagedDuels.pages} total={pagedDuels.total} goTo={pagedDuels.goTo} singular="challenge" />
              </>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

// ProHub mounts this panel without an id, so the audit log reads the signed-in
// administrator from the browser session until the prop is passed down.
function useAdminId(passed?: string): string {
  const [id, setId] = useState(passed ?? "");
  useEffect(() => {
    if (passed) { setId(passed); return; }
    let alive = true;
    async function resolve() {
      const { data } = await db().auth.getSession();
      const found = data.session?.user?.id ?? (await db().auth.getUser()).data.user?.id ?? "";
      if (alive) setId(found);
    }
    void resolve();
    return () => { alive = false; };
  }, [passed]);
  return id;
}

function QuizEditor({ quiz, adminId, onSave }: {
  quiz: Quiz;
  adminId: string;
  onSave: (values: Record<string, unknown>) => Promise<Quiz | null>;
}) {
  const [form, setForm] = useState({
    title: quiz.title,
    description: quiz.description ?? "",
    category: quiz.category ?? "",
    difficulty: quiz.difficulty,
    time_limit_seconds: String(quiz.time_limit_seconds),
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    const seconds = Number(form.time_limit_seconds);
    if (form.title.trim().length < 2) { toast.error("Give the quiz a title."); return; }
    if (!(seconds >= 30 && seconds <= 3600)) { toast.error("The time limit must be between 30 and 3600 seconds."); return; }
    setBusy(true);
    const next = await onSave({
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      difficulty: form.difficulty,
      time_limit_seconds: seconds,
    });
    setBusy(false);
    if (!next) return;
    await audit(adminId, {
      entityId: quiz.id, entityType: "quiz", action: "quiz_updated",
      reason: `Edited “${next.title}” · ${next.difficulty} · ${next.time_limit_seconds}s.`,
    });
    toast.success("Quiz details saved.");
  }

  return (
    <div className="p-3 rounded-xl space-y-2" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">Quiz details</p>
      <div className="grid sm:grid-cols-2 gap-2">
        <Field label="Title *"><input className="input text-sm" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Category"><input className="input text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
        <Field label="Difficulty">
          <select className="input text-sm" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as Quiz["difficulty"] })}>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Time limit (seconds, 30–3600)">
          <input className="input text-sm" inputMode="numeric" value={form.time_limit_seconds}
            onChange={(e) => setForm({ ...form, time_limit_seconds: e.target.value.replace(/\D/g, "") })} />
        </Field>
      </div>
      <Field label="Description"><input className="input text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <Button size="sm" loading={busy} icon={<Save className="w-3.5 h-3.5" />} onClick={() => void save()}>Save details</Button>
    </div>
  );
}

function QuestionEditor({ index, question, correctIndex, adminId, onSaved, onDeleted }: {
  index: number;
  question: Question;
  correctIndex: number;
  adminId: string;
  onSaved: (next: Question, correct: number) => void;
  onDeleted: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState(question.prompt);
  const [options, setOptions] = useState<string[]>(question.options.length >= 2 ? question.options : ["", ""]);
  const [correct, setCorrect] = useState(correctIndex >= 0 ? correctIndex : 0);
  const [busy, setBusy] = useState(false);

  async function save() {
    const kept = options.map((o, i) => ({ text: o.trim(), i })).filter((x) => x.text.length > 0);
    const clean = kept.map((x) => x.text);
    if (prompt.trim().length < 2) { toast.error("The question text is too short."); return; }
    if (clean.length < 2) { toast.error("Write at least two options."); return; }
    const answerIndex = kept.findIndex((x) => x.i === correct);
    if (answerIndex < 0) { toast.error("Pick which option is the right answer."); return; }
    setBusy(true);
    const { data, error } = await db().from("quiz_questions")
      .update({ prompt: prompt.trim(), options: clean }).eq("id", question.id).select().single();
    if (error || !data) { setBusy(false); toast.error("Question not saved: " + (error?.message ?? "")); return; }
    const { error: keyError } = await db().from("quiz_answers")
      .upsert({ question_id: question.id, correct_index: answerIndex }, { onConflict: "question_id" });
    setBusy(false);
    if (keyError) { toast.error("The answer key refused the update: " + keyError.message); return; }
    await audit(adminId, {
      entityId: question.id, entityType: "quiz_question", action: "quiz_question_updated",
      reason: `Question ${index + 1} saved: “${prompt.trim().slice(0, 80)}”, correct option ${answerIndex + 1}.`,
    });
    onSaved({ ...(data as Question), options: clean }, answerIndex);
    toast.success("Question saved.");
  }

  return (
    <div className="p-3 rounded-xl space-y-2" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-[var(--text-secondary)]">Q{index + 1}</span>
        <input className="input text-sm flex-1 min-w-0" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <Button size="sm" variant="ghost" icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />} onClick={async () => {
          const { error } = await db().from("quiz_questions").delete().eq("id", question.id);
          if (error) { toast.error("Could not remove it: " + error.message); return; }
          await audit(adminId, {
            entityId: question.id, entityType: "quiz_question", action: "quiz_question_deleted",
            reason: `Removed question “${question.prompt.slice(0, 80)}”.`,
          });
          onDeleted(question.id);
          toast.success("Question removed.");
        }}>Delete</Button>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="radio" name={`correct-${question.id}`} checked={correct === i} onChange={() => setCorrect(i)}
              aria-label={`Mark option ${i + 1} correct`} />
            <input className="input text-sm flex-1 min-w-0" placeholder={`Option ${i + 1}`} value={o}
              onChange={(e) => setOptions((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" loading={busy} icon={<Save className="w-3.5 h-3.5" />} onClick={() => void save()}>Save question</Button>
        {options.length < 6 && (
          <Button size="sm" variant="ghost" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setOptions((p) => [...p, ""])}>Add option</Button>
        )}
        <span className="text-xs text-[var(--text-secondary)]">The dot marks the answer players are graded against.</span>
      </div>
    </div>
  );
}

function AddQuestion({ quizId, existing, adminId, onAdded }: {
  quizId: string;
  existing: number;
  adminId: string;
  onAdded: (question: Question, correct: number) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const kept = options.map((o, i) => ({ text: o.trim(), i })).filter((x) => x.text.length > 0);
    const clean = kept.map((x) => x.text);
    if (prompt.trim().length < 3) { toast.error("Write the question."); return; }
    if (clean.length < 2) { toast.error("Give at least two options."); return; }
    const answerIndex = kept.findIndex((x) => x.i === correct);
    if (answerIndex < 0) { toast.error("Mark which option is correct."); return; }
    setBusy(true);
    const { data, error } = await db().from("quiz_questions")
      .insert({ quiz_id: quizId, prompt: prompt.trim(), options: clean, position: existing }).select().single();
    if (error || !data) { setBusy(false); toast.error("Could not add: " + (error?.message ?? "paste migration 031")); return; }
    const { error: keyError } = await db().from("quiz_answers")
      .insert({ question_id: (data as Question).id, correct_index: answerIndex });
    setBusy(false);
    if (keyError) { toast.error("Question stored but the answer key refused it: " + keyError.message); return; }
    await audit(adminId, {
      entityId: (data as Question).id, entityType: "quiz_question", action: "quiz_question_created",
      reason: `Added question ${existing + 1} to quiz ${quizId}: “${prompt.trim().slice(0, 80)}”.`,
    });
    onAdded({ ...(data as Question), options: clean }, answerIndex);
    setPrompt("");
    setOptions(["", "", "", ""]);
    setCorrect(0);
    toast.success("Question added.");
  }

  return (
    <div className="p-3 rounded-xl space-y-2" style={{ backgroundColor: "var(--bg-card)", border: "1px dashed var(--border)" }}>
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">New question</p>
      <input className="input text-sm" placeholder="Question text *" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="grid sm:grid-cols-2 gap-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="radio" name={`new-correct-${quizId}`} checked={correct === i} onChange={() => setCorrect(i)}
              aria-label={`Mark option ${i + 1} correct`} />
            <input className="input text-sm flex-1 min-w-0" placeholder={`Option ${i + 1}`} value={o}
              onChange={(e) => setOptions((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" loading={busy} icon={<Plus className="w-3.5 h-3.5" />} onClick={() => void submit()}>Add question</Button>
        {options.length < 6 && <Button size="sm" variant="ghost" onClick={() => setOptions((p) => [...p, ""])}>Add option</Button>}
      </div>
    </div>
  );
}
