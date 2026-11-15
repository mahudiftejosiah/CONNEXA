"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Trophy, X } from "lucide-react";
import toast from "react-hot-toast";
import { fetchQuiz, finishQuiz, listPlayableQuizzes, type PlayableQuestion } from "@/lib/actions/pro";

type QuizRow = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  difficulty: string;
  time_limit_seconds: number;
  questions: number;
  best: number | null;
  attempts: number;
};

type Result = { score: number; total: number; rows: { prompt?: string; right: boolean }[] };

export function QuizBattles({
  initialQuizzes,
  canPlay,
  note,
}: {
  initialQuizzes: QuizRow[];
  canPlay: boolean;
  note: string | null;
}) {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState(initialQuizzes);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<PlayableQuestion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const startedAt = useRef(0);

  const close = useCallback(() => {
    setActiveId(null);
    setQuestions([]);
    setAnswers([]);
    setResult(null);
  }, []);

  async function open(quiz: QuizRow) {
    setLoading(true);
    const res = await fetchQuiz(quiz.id);
    setLoading(false);
    if ("error" in res) { toast.error(res.error); return; }
    if (res.questions.length === 0) { toast.error("This quiz has no questions yet."); return; }
    setActiveId(quiz.id);
    setQuestions(res.questions);
    setAnswers([]);
    setIndex(0);
    setLeft(res.timeLimit);
    setResult(null);
    startedAt.current = Date.now();
  }

  const submit = useCallback(async (given: number[]) => {
    const seconds = Math.round((Date.now() - startedAt.current) / 1000);
    const res = await finishQuiz(
      activeId ?? "",
      questions.map((_, i) => ({ choice: given[i] ?? -1 })),
      seconds
    );
    if ("error" in res) { toast.error(res.error); return; }
    setResult({
      score: Number(res.score),
      total: Number(res.total),
      rows: Array.isArray(res.results) ? (res.results as Result["rows"]) : [],
    });
    const listed = await listPlayableQuizzes();
    if ("quizzes" in listed) {
      setQuizzes(listed.quizzes);
      router.refresh();
    }
  }, [activeId, questions, router]);

  useEffect(() => {
    if (!activeId || result || questions.length === 0) return;
    if (left <= 0) { void submit(answers); return; }
    const t = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [activeId, left, result, questions.length, answers, submit]);

  if (result) {
    return (
      <div className="card p-6 space-y-4 text-center">
        <Trophy className="w-9 h-9 mx-auto" style={{ color: "var(--brand-gold)" }} />
        <p className="text-3xl font-extrabold" style={{ color: "var(--text-primary)" }}>
          {result.score} / {result.total}
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Scored in the database, and already on your record.
        </p>
        <button type="button" className="btn-primary text-sm mx-auto" onClick={close}>Back to the list</button>
      </div>
    );
  }

  if (activeId && questions.length > 0) {
    const q = questions[index];
    return (
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>
            Question {index + 1} of {questions.length}
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-bold"
            style={{ color: left <= 10 ? "#ef4444" : "var(--text-secondary)" }}>
            <Clock className="w-4 h-4" />{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </span>
          <button type="button" onClick={close} className="p-1.5 rounded-lg border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{q.prompt}</p>
        <ul className="space-y-2">
          {q.options.map((opt, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  const next = [...answers];
                  next[index] = i;
                  setAnswers(next);
                }}
                className="w-full text-left rounded-xl border px-4 py-3 text-sm font-semibold"
                style={{
                  borderColor: answers[index] === i ? "var(--brand-gold)" : "var(--border)",
                  background: answers[index] === i ? "rgb(var(--b-400) / 0.12)" : "transparent",
                  color: "var(--text-primary)",
                }}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          {index > 0 && (
            <button type="button" className="btn-ghost text-sm" onClick={() => setIndex((v) => v - 1)}>Back</button>
          )}
          {index < questions.length - 1 ? (
            <button type="button" className="btn-primary text-sm ml-auto" disabled={answers[index] === undefined}
              onClick={() => setIndex((v) => v + 1)}>Next</button>
          ) : (
            <button type="button" className="btn-primary text-sm ml-auto" disabled={answers.length < questions.length}
              onClick={() => void submit(answers)}>Finish</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!canPlay && (
        <div className="card p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
          Playing a battle is part of PRO. <a href="/pro#upgrade" style={{ color: "var(--brand-gold)", fontWeight: 700 }}>Upgrade to PRO</a>.
        </div>
      )}
      {note && <ProNote>{note}</ProNote>}
      {loading && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading…</p>}

      {quizzes.length === 0 && !loading && (
        <div className="card p-8 text-center space-y-2">
          <Trophy className="w-8 h-8 mx-auto" style={{ color: "var(--text-secondary)" }} />
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>No quiz is open</p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            An administrator writes rounds in Admin → PRO Management. Questions and answers appear there.
          </p>
        </div>
      )}

      {quizzes.map((q) => (
        <article key={q.id} className="card p-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-bold" style={{ color: "var(--text-primary)" }}>{q.title}</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {q.questions} questions · {Math.round(q.time_limit_seconds / 60)} min · {q.difficulty}
              {q.category ? ` · ${q.category}` : ""}
            </p>
            {q.description && <p className="text-xs line-clamp-2" style={{ color: "var(--text-secondary)" }}>{q.description}</p>}
            <p className="text-xs font-semibold mt-1" style={{ color: q.best === null ? "var(--text-secondary)" : "var(--brand-gold)" }}>
              {q.attempts === 0 ? "Not played yet" : `${q.attempts} ${q.attempts === 1 ? "attempt" : "attempts"} · best ${q.best}/${q.questions}`}
            </p>
          </div>
          <button type="button" className="btn-primary text-sm" disabled={!canPlay || loading || q.questions === 0} onClick={() => void open(q)}>
            Play
          </button>
        </article>
      ))}
    </div>
  );
}

function ProNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
      {children}
    </div>
  );
}
