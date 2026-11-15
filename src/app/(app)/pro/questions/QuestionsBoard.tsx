"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { answerDailyQuestion, askDailyQuestion, retireDailyQuestion } from "@/lib/actions/pro";

type Reply = { id: string; answer: string; user_id: string; created_at: string };
type Question = {
  id: string;
  question: string;
  category: string | null;
  asked_on: string;
  created_at: string;
  author_id: string;
  replies: Reply[];
};

export function QuestionsBoard({
  questions,
  currentUserId,
  canPost,
}: {
  questions: Question[];
  currentUserId: string;
  canPost: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({});

  const byDay = useMemo(() => {
    const map = new Map<string, Question[]>();
    for (const q of questions) {
      const list = map.get(q.asked_on) ?? [];
      list.push(q);
      map.set(q.asked_on, list);
    }
    return Array.from(map.entries());
  }, [questions]);

  function submit() {
    if (!text.trim()) return;
    start(async () => {
      const res = await askDailyQuestion(text, category);
      if ("error" in res) { toast.error(res.error); return; }
      setText("");
      setCategory("");
      toast.success("Question asked.");
      router.refresh();
    });
  }

  function answer(id: string) {
    const value = drafts[id] ?? "";
    if (!value.trim()) return;
    start(async () => {
      const res = await answerDailyQuestion(id, value);
      if ("error" in res) { toast.error(res.error); return; }
      setDrafts((d) => ({ ...d, [id]: "" }));
      router.refresh();
    });
  }

  function retire(id: string) {
    start(async () => {
      const res = await retireDailyQuestion(id);
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {canPost && (
        <div className="card p-4 space-y-3">
          <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>Ask today&apos;s question</h2>
          <textarea
            className="input min-h-[76px] resize-y"
            placeholder="What do you want your community to answer today?"
            value={text}
            maxLength={300}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="input max-w-[180px]"
              placeholder="Category (optional)"
              value={category}
              maxLength={40}
              onChange={(e) => setCategory(e.target.value)}
            />
            <button type="button" className="btn-primary text-sm ml-auto" disabled={pending || !text.trim()} onClick={submit}>
              Post question
            </button>
          </div>
        </div>
      )}

      {byDay.map(([day, list]) => (
        <section key={day} className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </h2>
          {list.map((q) => {
            const mine = q.replies.find((r) => r.user_id === currentUserId);
            const others = q.replies.filter((r) => r.user_id !== currentUserId);
            const showAll = openReplies[q.id];
            return (
              <article key={q.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{q.question}</p>
                    {q.category && (
                      <span className="inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: "var(--border)", color: "var(--text-secondary)" }}>
                        {q.category}
                      </span>
                    )}
                  </div>
                  {q.author_id === currentUserId && (
                    <button type="button" onClick={() => retire(q.id)} disabled={pending}
                      className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "#ef4444" }}>
                      <Trash2 className="w-3.5 h-3.5" /> Close
                    </button>
                  )}
                </div>

                {mine ? (
                  <div className="rounded-xl px-3 py-2" style={{ background: "rgb(var(--a-800) / 0.08)" }}>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Your answer</p>
                    <p className="text-sm" style={{ color: "var(--text-primary)" }}>{mine.answer}</p>
                  </div>
                ) : canPost ? (
                  <div className="flex gap-2">
                    <input
                      className="input"
                      placeholder="Your answer"
                      maxLength={500}
                      value={drafts[q.id] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                    />
                    <button type="button" className="btn-primary text-sm" disabled={pending} onClick={() => answer(q.id)}>
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    <a href="/pro" style={{ color: "var(--brand-gold)", fontWeight: 700 }}>Upgrade to PRO</a> to answer.
                  </p>
                )}

                <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <MessageSquare className="w-3.5 h-3.5" />
                  {q.replies.length} {q.replies.length === 1 ? "answer" : "answers"}
                  {others.length > 2 && (
                    <button type="button" className="ml-2 font-semibold" style={{ color: "rgb(var(--a-800))" }}
                      onClick={() => setOpenReplies((o) => ({ ...o, [q.id]: !o[q.id] }))}>
                      {showAll ? "Hide" : "Show"}
                    </button>
                  )}
                </div>
                {others.length > 0 && (
                  <ul className="space-y-1.5">
                    {(showAll ? others : others.slice(0, 2)).map((r) => (
                      <li key={r.id} className="text-sm rounded-xl px-3 py-2" style={{ background: "var(--border)", color: "var(--text-primary)" }}>
                        {r.answer}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
