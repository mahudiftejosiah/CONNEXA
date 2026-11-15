"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, Save, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";
import { db, useRows, Field, Panel, Notice, Stat, Switch } from "./useRows";
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

const DIFFICULTIES: Quiz["difficulty"][] = ["easy", "medium", "hard", "mixed"];

export function ProQuizzes() {
  const quizzes = useRows<Quiz>("quizzes", { order: "created_at" });
  const questions = useRows<Question>("quiz_questions", { order: "position", ascending: true });
  const keys = useRows<AnswerKey>("quiz_answers");
  const attempts = useRows<Attempt>("quiz_attempts", { order: "created_at" });
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newQuiz, setNewQuiz] = useState({ title: "", description: "", category: "", difficulty: "mixed" as Quiz["difficulty"], time_limit_seconds: "300" });

  const questionsOf = (quizId: string) => questions.rows.filter((q) => q.quiz_id === quizId);
  const statsOf = (quizId: string) => {
    const list = attempts.rows.filter((a) => a.quiz_id === quizId);
    if (list.length === 0) return null;
    const pct = list.reduce((s, a) => s + (a.total > 0 ? a.score / a.total : 0), 0) / list.length;
    return { plays: list.length, avg: Math.round(pct * 100), best: Math.max(...list.map((a) => a.score)), last: list[0].created_at };
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Quizzes" value={quizzes.rows.length} />
        <Stat label="Published" value={quizzes.rows.filter((q) => q.published).length} />
        <Stat label="Questions written" value={questions.rows.length} />
        <Stat label="Attempts played" value={attempts.rows.length} />
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
                      toast.success(v ? "Open to PRO members." : "Withdrawn from the list.");
                    }} />
                    <Button size="sm" variant="ghost" onClick={() => setOpen(expanded ? null : q.id)}
                      icon={expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}>
                      {expanded ? "Close" : "Questions"}
                    </Button>
                    <Button size="sm" variant="ghost" loading={busy === q.id} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      onClick={async () => {
                        if (!confirm(`Delete “${q.title}” and its ${questionsOf(q.id).length} questions? Graded attempts stay in the history.`)) return;
                        if (await quizzes.drop("id", q.id)) { questions.set((p) => p.filter((x) => x.quiz_id !== q.id)); toast.success("Quiz deleted."); }
                      }}>
                      Delete
                    </Button>
                  </div>

                  {expanded && (
                    <div className="p-3 pt-0 space-y-3 border-t" style={{ borderColor: "var(--border)" }}>
                      {questionsOf(q.id).map((question, index) => (
                        <QuestionEditor key={question.id} index={index} question={question}
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
                      <AddQuestion quizId={q.id} existing={questionsOf(q.id).length}
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
    </div>
  );
}

function QuestionEditor({ index, question, correctIndex, onSaved, onDeleted }: {
  index: number;
  question: Question;
  correctIndex: number;
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

function AddQuestion({ quizId, existing, onAdded }: {
  quizId: string;
  existing: number;
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
