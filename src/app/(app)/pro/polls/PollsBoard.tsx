"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { closePoll, createPoll, votePoll } from "@/lib/actions/pro";
import { formatRelativeTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { ReportButton } from "@/components/pro/ReportButton";

type Poll = {
  id: string;
  question: string;
  owner_id: string;
  closes_at: string | null;
  created_at: string;
  options: { id: string; label: string; position: number }[];
  votes: { option_id: string; user_id: string }[];
};

export function PollsBoard({
  polls,
  currentUserId,
  canVote,
  canCreate,
}: {
  polls: Poll[];
  currentUserId: string;
  canVote: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [composing, setComposing] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [hours, setHours] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  function addPoll() {
    start(async () => {
      const res = await createPoll(question, options, hours || undefined);
      if ("error" in res) { toast.error(res.error); return; }
      setQuestion("");
      setOptions(["", ""]);
      setComposing(false);
      toast.success("Poll live.");
      router.refresh();
    });
  }

  function vote(pollId: string, optionId: string) {
    start(async () => {
      const res = await votePoll(pollId, optionId);
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {canCreate && !composing && (
        <button type="button" className="btn-primary text-sm" onClick={() => setComposing(true)}>
          <Plus className="w-4 h-4" /> New poll
        </button>
      )}

      {composing && (
        <div className="card p-4 space-y-3">
          <input className="input" maxLength={300} placeholder="What are you asking?"
            value={question} onChange={(e) => setQuestion(e.target.value)} />
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input className="input" maxLength={120} placeholder={`Choice ${i + 1}`}
                value={o} onChange={(e) => setOptions((list) => list.map((v, j) => (j === i ? e.target.value : v)))} />
              {options.length > 2 && (
                <button type="button" onClick={() => setOptions((l) => l.filter((_, j) => j !== i))}
                  className="p-2 rounded-lg border" style={{ borderColor: "var(--border)", color: "#ef4444" }}>
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            {options.length < 6 && (
              <button type="button" className="btn-ghost text-sm" onClick={() => setOptions((l) => [...l, ""])}>Add choice</button>
            )}
            <label className="text-sm flex items-center gap-2 ml-auto" style={{ color: "var(--text-secondary)" }}>
              Closes in
              <select className="input max-w-[130px]" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                <option value={0}>no deadline</option>
                <option value={6}>6 hours</option>
                <option value={24}>1 day</option>
                <option value={72}>3 days</option>
                <option value={168}>7 days</option>
              </select>
            </label>
            <button type="button" className="btn-primary text-sm" disabled={pending} onClick={addPoll}>Publish poll</button>
            <button type="button" className="btn-ghost text-sm" onClick={() => setComposing(false)}>Cancel</button>
          </div>
        </div>
      )}

      {!ready && !composing && (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="card p-4 space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-9 w-full rounded-xl" />
              <Skeleton className="h-9 w-full rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {ready && polls.length === 0 && !composing && (
        <div className="card p-8 text-center" style={{ color: "var(--text-secondary)" }}>No polls are open.</div>
      )}

      {ready && polls.map((poll) => {
        const total = poll.votes.length;
        const myVote = poll.votes.find((v) => v.user_id === currentUserId);
        const closed = !!poll.closes_at && new Date(poll.closes_at).getTime() < Date.now();
        const showResults = !!myVote || closed || !canVote;
        return (
          <article key={poll.id} className="card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{poll.question}</p>
              {poll.owner_id === currentUserId && (
                <button type="button" className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "#ef4444" }}
                  disabled={pending} onClick={() => start(async () => { await closePoll(poll.id); router.refresh(); })}>
                  <Trash2 className="w-3.5 h-3.5" /> Close
                </button>
              )}
            </div>

            <ul className="space-y-2">
              {poll.options.sort((a, b) => a.position - b.position).map((o) => {
                const count = poll.votes.filter((v) => v.option_id === o.id).length;
                const pct = total === 0 ? 0 : Math.round((count / total) * 100);
                const chosen = myVote?.option_id === o.id;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      disabled={!!myVote || closed || pending || !canVote}
                      onClick={() => vote(poll.id, o.id)}
                      className="w-full text-left rounded-xl border px-3 py-2 relative overflow-hidden disabled:cursor-default"
                      style={{ borderColor: chosen ? "var(--brand-gold)" : "var(--border)" }}
                    >
                      {showResults && (
                        <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: "rgb(var(--a-800) / 0.12)" }} />
                      )}
                      <span className="relative flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                        {chosen && <CheckCircle2 className="w-4 h-4" style={{ color: "var(--brand-gold)" }} />}
                        {o.label}
                        {showResults && <span className="ml-auto text-xs font-bold">{pct}% · {count}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {total} {total === 1 ? "vote" : "votes"} · posted {formatRelativeTime(poll.created_at)}
              {closed ? " · closed" : poll.closes_at ? ` · closes ${new Date(poll.closes_at).toLocaleString()}` : ""}
            </p>
            {!canVote && !myVote && (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Voting is part of PRO. <a href="/pro" style={{ color: "var(--brand-gold-text)", fontWeight: 700 }}>Upgrade to PRO</a>.
              </p>
            )}
            <ReportButton entityType="poll" entityId={poll.id} />
          </article>
        );
      })}
    </div>
  );
}
