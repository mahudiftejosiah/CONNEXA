"use client";

import { useState } from "react";
import { CheckCircle, Hash, MessageSquare, Plus, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";
import { db, useNames, useRows, Field, Panel, Notice, Stat, Switch, dayValue } from "./useRows";
import toast from "react-hot-toast";

type Question = {
  id: string; author_id: string; question: string; category: string | null;
  asked_on: string; published: boolean; created_at: string;
};
type Reply = { id: string; question_id: string; user_id: string; answer: string; created_at: string };
type Confession = {
  id: string; body: string; tag: string | null;
  status: "pending" | "approved" | "rejected"; created_at: string;
};
type ConfessionAuthor = { confession_id: string; author_id: string };
type Poll = { id: string; owner_id: string; question: string; closes_at: string | null; published: boolean; created_at: string };
type PollOption = { id: string; poll_id: string; label: string; position: number };
type PollVote = { id: string; poll_id: string; option_id: string; user_id: string };
type BlockedTag = { tag: string; reason: string | null; created_at: string };

export function ProCommunity({ adminId }: { adminId: string }) {
  const names = useNames();
  const questions = useRows<Question>("daily_questions", { order: "created_at" });
  const replies = useRows<Reply>("daily_question_replies", { order: "created_at" });
  const confessions = useRows<Confession>("confessions", { order: "created_at" });
  const authors = useRows<ConfessionAuthor>("confession_authors");
  const polls = useRows<Poll>("polls", { order: "created_at" });
  const options = useRows<PollOption>("poll_options", { order: "position", ascending: true });
  const votes = useRows<PollVote>("poll_votes");
  const blocked = useRows<BlockedTag>("blocked_hashtags", { order: "created_at" });

  const [busy, setBusy] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState({ question: "", category: "", asked_on: dayValue(new Date().toISOString()) });
  const [confessionFilter, setConfessionFilter] = useState<Confession["status"]>("pending");
  const [newConfessionAuthor, setNewConfessionAuthor] = useState<string | null>(null);
  const [newPoll, setNewPoll] = useState({ question: "", closes_at: "", options: ["", "", "", ""] });
  const [newTag, setNewTag] = useState({ tag: "", reason: "" });

  const pendingConfessions = confessions.rows.filter((c) => c.status === "pending");
  const shownConfessions = confessions.rows.filter((c) => c.status === confessionFilter);

  async function moderateConfession(c: Confession, status: "approved" | "rejected") {
    setBusy(c.id);
    const { error } = await db().from("confessions")
      .update({ status, reviewed_by: adminId, reviewed_at: new Date().toISOString() }).eq("id", c.id);
    setBusy(null);
    if (error) { toast.error("Could not moderate: " + error.message); return; }
    confessions.set((p) => p.map((x) => (x.id === c.id ? { ...x, status } : x)));
    toast.success(status === "approved" ? "On the wall." : "Rejected — nobody sees it.");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Questions asked" value={questions.rows.length} />
        <Stat label="Answers given" value={replies.rows.length} />
        <Stat label="Confessions waiting" value={pendingConfessions.length} />
        <Stat label="Poll votes cast" value={votes.rows.length} />
      </div>

      <Panel title="Daily questions" hint="A question dated today appears at the top of the board for every PRO member. Publishing decides whether it shows, not deleting.">
        <Notice text={questions.error} />
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Question *"><input className="input" value={newQuestion.question} onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })} /></Field>
          <Field label="Category"><input className="input" placeholder="Work, school, football…" value={newQuestion.category} onChange={(e) => setNewQuestion({ ...newQuestion, category: e.target.value })} /></Field>
          <Field label="Asked on"><input type="date" className="input" value={newQuestion.asked_on} onChange={(e) => setNewQuestion({ ...newQuestion, asked_on: e.target.value })} /></Field>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={async () => {
          if (newQuestion.question.trim().length < 3) { toast.error("Write the question."); return; }
          if (!newQuestion.asked_on) { toast.error("Choose the day it belongs to."); return; }
          const { data, error } = await db().from("daily_questions").insert({
            author_id: adminId,
            question: newQuestion.question.trim(),
            category: newQuestion.category.trim() || null,
            asked_on: newQuestion.asked_on,
          }).select().single();
          if (error || !data) { toast.error("Could not schedule it: " + (error?.message ?? "paste migration 030")); return; }
          questions.set((p) => [data as Question, ...p]);
          setNewQuestion({ question: "", category: "", asked_on: dayValue(new Date().toISOString()) });
          toast.success("Scheduled for that day.");
        }}>Schedule question</Button>

        {questions.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nothing asked yet.</p>
        ) : (
          <div className="space-y-2">
            {questions.rows.map((q) => {
              const own = replies.rows.filter((r) => r.question_id === q.id);
              return (
                <div key={q.id} className="p-3 rounded-xl space-y-1.5" style={{ backgroundColor: "var(--bg-main)" }}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-[12rem]">
                      <p className="font-semibold text-sm">{q.question}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {dayValue(q.asked_on)}{q.category ? ` · ${q.category}` : ""} · by @{names[q.author_id] ?? "someone"} · {own.length} {own.length === 1 ? "answer" : "answers"}
                      </p>
                    </div>
                    <Switch on={q.published} label={q.question} onChange={async (v) => {
                      setBusy(q.id);
                      const { error } = await db().from("daily_questions").update({ published: v }).eq("id", q.id);
                      setBusy(null);
                      if (error) { toast.error("Could not change that."); return; }
                      questions.set((p) => p.map((x) => (x.id === q.id ? { ...x, published: v } : x)));
                    }} />
                    <Button size="sm" variant="ghost" loading={busy === q.id} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      onClick={async () => { if (await questions.drop("id", q.id)) { replies.set((p) => p.filter((r) => r.question_id !== q.id)); toast.success("Question deleted."); } }}>
                      Delete
                    </Button>
                  </div>
                  {own.length > 0 && (
                    <ul className="text-xs text-[var(--text-secondary)] space-y-0.5 pl-1">
                      {own.slice(0, 6).map((r) => (
                        <li key={r.id}>@{names[r.user_id] ?? "member"}: {r.answer}</li>
                      ))}
                      {own.length > 6 && <li>…and {own.length - 6} more.</li>}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Anonymous confessions"
        hint="Members submit without a name attached to the public record. The writer is looked up only when you press Reveal, and only an administrator can read that link at all — the wall never shows it.">
        <Notice text={confessions.error} />
        <div className="flex flex-wrap gap-2">
          {(["pending", "approved", "rejected"] as const).map((s) => (
            <button key={s} onClick={() => setConfessionFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium capitalize transition-colors ${confessionFilter === s ? "bg-brand-green-800 text-white" : "bg-[var(--border)] text-[var(--text-secondary)]"}`}>
              {s} ({confessions.rows.filter((c) => c.status === s).length})
            </button>
          ))}
        </div>
        {shownConfessions.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nothing {confessionFilter}.</p>
        ) : (
          <div className="space-y-2">
            {shownConfessions.map((c) => {
              const author = authors.rows.find((a) => a.confession_id === c.id);
              return (
                <div key={c.id} className="p-3 rounded-xl space-y-1.5" style={{ backgroundColor: "var(--bg-main)" }}>
                  <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{c.body}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {c.tag ? `#${c.tag} · ` : ""}{formatRelativeTime(c.created_at)}
                    {newConfessionAuthor === c.id && (
                      <span className="ml-1 font-semibold" style={{ color: "var(--brand-gold)" }}>
                        · written by @{names[author?.author_id ?? ""] ?? "unknown"}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.status !== "approved" && (
                      <Button size="sm" loading={busy === c.id} icon={<CheckCircle className="w-3.5 h-3.5" />} onClick={() => void moderateConfession(c, "approved")}>Approve</Button>
                    )}
                    {c.status !== "rejected" && (
                      <Button size="sm" variant="ghost" loading={busy === c.id} icon={<XCircle className="w-3.5 h-3.5" />} onClick={() => void moderateConfession(c, "rejected")}>Reject</Button>
                    )}
                    <Button size="sm" variant="ghost" icon={<MessageSquare className="w-3.5 h-3.5" />}
                      onClick={() => {
                        if (newConfessionAuthor === c.id) { setNewConfessionAuthor(null); return; }
                        setNewConfessionAuthor(c.id);
                        if (author) return;
                        void db().from("confession_authors").select("*").eq("confession_id", c.id).then(({ data }) => {
                          const row = (data ?? [])[0] as ConfessionAuthor | undefined;
                          if (row) authors.set((p) => [...p, row]);
                          else toast("No writer record for this confession.");
                        });
                      }}>
                      {newConfessionAuthor === c.id ? "Hide writer" : "Reveal writer"}
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      onClick={async () => { if (await confessions.drop("id", c.id)) toast.success("Confession deleted."); }}>
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Community polls" hint="One vote per person, enforced in the database. Create a poll here or leave it to members; either way the totals below are the real ballot.">
        <Notice text={polls.error} />
        <div className="space-y-3">
          <Field label="Question *"><input className="input" value={newPoll.question} onChange={(e) => setNewPoll({ ...newPoll, question: e.target.value })} /></Field>
          <div className="grid sm:grid-cols-2 gap-2">
            {newPoll.options.map((o, i) => (
              <input key={i} className="input" placeholder={`Choice ${i + 1}`} value={o}
                onChange={(e) => setNewPoll({ ...newPoll, options: newPoll.options.map((x, j) => (j === i ? e.target.value : x)) })} />
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Closes at (optional)">
              <input type="datetime-local" className="input" value={newPoll.closes_at} onChange={(e) => setNewPoll({ ...newPoll, closes_at: e.target.value })} />
            </Field>
            <Button icon={<Plus className="w-4 h-4" />} onClick={async () => {
              const choices = newPoll.options.map((o) => o.trim()).filter((o) => o.length > 0);
              if (newPoll.question.trim().length < 3) { toast.error("Write the poll question."); return; }
              if (choices.length < 2) { toast.error("A poll needs at least two choices."); return; }
              const { data, error } = await db().from("polls").insert({
                owner_id: adminId,
                question: newPoll.question.trim(),
                closes_at: newPoll.closes_at ? new Date(newPoll.closes_at).toISOString() : null,
              }).select().single();
              if (error || !data) { toast.error("Could not create: " + (error?.message ?? "paste migration 030")); return; }
              const poll = data as Poll;
              const { error: optError } = await db().from("poll_options")
                .insert(choices.map((label, position) => ({ poll_id: poll.id, label, position })));
              if (optError) { toast.error("The question saved but its choices did not: " + optError.message); return; }
              polls.set((p) => [poll, ...p]);
              setNewPoll({ question: "", closes_at: "", options: ["", "", "", ""] });
              toast.success("Poll published.");
            }}>Publish poll</Button>
          </div>
        </div>

        {polls.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No polls yet.</p>
        ) : (
          <div className="space-y-2">
            {polls.rows.map((pl) => {
              const its = options.rows.filter((o) => o.poll_id === pl.id).sort((a, b) => a.position - b.position);
              const cast = votes.rows.filter((v) => v.poll_id === pl.id);
              return (
                <div key={pl.id} className="p-3 rounded-xl space-y-1.5" style={{ backgroundColor: "var(--bg-main)" }}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-[12rem]">
                      <p className="font-semibold text-sm">{pl.question}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        by @{names[pl.owner_id] ?? "someone"} · {cast.length} vote(s)
                        {pl.closes_at ? ` · closes ${new Date(pl.closes_at).toLocaleString()}` : ""}
                      </p>
                    </div>
                    <Switch on={pl.published} label={pl.question} onChange={async (v) => {
                      setBusy(pl.id);
                      const { error } = await db().from("polls").update({ published: v }).eq("id", pl.id);
                      setBusy(null);
                      if (error) { toast.error("Could not change that."); return; }
                      polls.set((p) => p.map((x) => (x.id === pl.id ? { ...x, published: v } : x)));
                    }} />
                    <Button size="sm" variant="ghost" loading={busy === pl.id} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      onClick={async () => { if (await polls.drop("id", pl.id)) toast.success("Poll deleted."); }}>
                      Delete
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {its.map((o) => {
                      const n = cast.filter((v) => v.option_id === o.id).length;
                      const pct = cast.length ? Math.round((n / cast.length) * 100) : 0;
                      return (
                        <div key={o.id} className="flex items-center gap-2 text-xs">
                          <span className="flex-1 min-w-0 truncate">{o.label}</span>
                          <span className="w-24 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                            <span className="block h-full" style={{ width: `${pct}%`, backgroundColor: "var(--brand-gold)" }} />
                          </span>
                          <span className="w-12 text-right text-[var(--text-secondary)]">{n} · {pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Trending hashtag moderation"
        hint="Trending is computed from real posts; a tag listed here is taken out of the list everywhere without touching the posts that used it.">
        <Notice text={blocked.error} />
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Tag">
            <input className="input" placeholder="e.g. spam" value={newTag.tag}
              onChange={(e) => setNewTag({ ...newTag, tag: e.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 30) })} />
          </Field>
          <Field label="Reason">
            <input className="input" value={newTag.reason} onChange={(e) => setNewTag({ ...newTag, reason: e.target.value })} />
          </Field>
          <Button icon={<Hash className="w-4 h-4" />} onClick={async () => {
            const tag = newTag.tag.trim().toLowerCase();
            if (tag.length < 2) { toast.error("Write the tag without the # sign."); return; }
            if (blocked.rows.some((b) => b.tag === tag)) { toast.error("That tag is already blocked."); return; }
            const { data, error } = await db().from("blocked_hashtags")
              .insert({ tag, blocked_by: adminId, reason: newTag.reason.trim() || null }).select().single();
            if (error || !data) { toast.error("Could not block it: " + (error?.message ?? "paste migration 030")); return; }
            blocked.set((p) => [data as BlockedTag, ...p]);
            setNewTag({ tag: "", reason: "" });
            toast.success(`#${tag} hidden from trending.`);
          }}>Block tag</Button>
        </div>
        {blocked.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No tags blocked.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {blocked.rows.map((b) => (
              <span key={b.tag} className="inline-flex items-center gap-1.5 text-xs pl-2.5 pr-1 py-1 rounded-lg" style={{ backgroundColor: "var(--bg-main)" }}>
                #{b.tag}{b.reason ? ` — ${b.reason}` : ""}
                <button type="button" aria-label={`Unblock ${b.tag}`} className="p-0.5 rounded hover:opacity-70"
                  onClick={async () => {
                    const { error } = await db().from("blocked_hashtags").delete().eq("tag", b.tag);
                    if (error) { toast.error("Could not unblock."); return; }
                    blocked.set((p) => p.filter((x) => x.tag !== b.tag));
                    toast.success(`#${b.tag} is trending-eligible again.`);
                  }}>
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
