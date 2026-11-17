"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Hash, MessageSquare, Plus, Save, Search, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";
import { db, useNames, useRows, Field, Panel, Notice, Stat, Switch, dayValue, whenValue, usePager, Pager, audit } from "./useRows";
import toast from "react-hot-toast";

type Question = {
  id: string; author_id: string; question: string; category: string | null;
  description?: string | null;
  asked_on: string; published: boolean; created_at: string;
};
type Reply = { id: string; question_id: string; user_id: string; answer: string; created_at: string };
type Confession = {
  id: string; body: string; tag: string | null;
  status: "pending" | "approved" | "rejected"; created_at: string;
};
type ConfessionAuthor = { confession_id: string; author_id: string };
type Poll = {
  id: string; owner_id: string; question: string; category?: string | null;
  closes_at: string | null; published: boolean; created_at: string;
};
type PollOption = { id: string; poll_id: string; label: string; position: number };
type PollVote = { id: string; poll_id: string; option_id: string; user_id: string };
type BlockedTag = { tag: string; reason: string | null; created_at: string };

function matches(haystack: string, term: string) {
  const t = term.trim().toLowerCase();
  return !t || haystack.toLowerCase().includes(t);
}

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
  const [newQuestion, setNewQuestion] = useState({ question: "", category: "", description: "", asked_on: dayValue(new Date().toISOString()) });
  const [confessionFilter, setConfessionFilter] = useState<Confession["status"]>("pending");
  const [newConfessionAuthor, setNewConfessionAuthor] = useState<string | null>(null);
  const [newPoll, setNewPoll] = useState({ question: "", category: "", closes_at: "", options: ["", "", "", ""] });
  const [newTag, setNewTag] = useState({ tag: "", reason: "" });
  const [qSearch, setQSearch] = useState("");
  const [qCategory, setQCategory] = useState("");
  const [cSearch, setCSearch] = useState("");
  const [pSearch, setPSearch] = useState("");
  const [pCategory, setPCategory] = useState("");
  const [qDraft, setQDraft] = useState<Question | null>(null);
  const [pDraft, setPDraft] = useState<Poll | null>(null);
  const [descColumn, setDescColumn] = useState(false);
  const [pollCatColumn, setPollCatColumn] = useState(false);

  // Migration 033 adds these two columns. Until it is pasted the panels simply
  // leave them out of every write, rather than failing the whole insert.
  useEffect(() => {
    let alive = true;
    void db().from("daily_questions").select("description").limit(1).then(({ error }) => { if (alive) setDescColumn(!error); });
    void db().from("polls").select("category").limit(1).then(({ error }) => { if (alive) setPollCatColumn(!error); });
    return () => { alive = false; };
  }, []);

  const pendingConfessions = confessions.rows.filter((c) => c.status === "pending");
  const shownConfessions = confessions.rows.filter((c) => c.status === confessionFilter && matches(c.body + " " + (c.tag ?? ""), cSearch));

  const questionCategories = Array.from(new Set(questions.rows.map((q) => q.category).filter((c): c is string => !!c))).sort();
  const pollCategories = Array.from(new Set(polls.rows.map((p) => p.category).filter((c): c is string => !!c))).sort();
  const shownQuestions = questions.rows.filter((q) =>
    (!qCategory || q.category === qCategory) && matches(q.question + " " + (q.description ?? "") + " " + (q.category ?? ""), qSearch));
  const shownPolls = polls.rows.filter((p) =>
    (!pCategory || p.category === pCategory) && matches(p.question + " " + (p.category ?? ""), pSearch));

  const qPaged = usePager(shownQuestions, 10);
  const cPaged = usePager(shownConfessions, 10);
  const pPaged = usePager(shownPolls, 10);

  async function moderateConfession(c: Confession, status: "approved" | "rejected") {
    setBusy(c.id);
    const { data, error } = await db().from("confessions")
      .update({ status, reviewed_by: adminId, reviewed_at: new Date().toISOString() }).eq("id", c.id).select("id");
    setBusy(null);
    if (error) { toast.error("Could not moderate: " + error.message); return; }
    if (!data?.length) { toast.error("Nothing changed — that confession is not yours to moderate."); return; }
    confessions.set((p) => p.map((x) => (x.id === c.id ? { ...x, status } : x)));
    void audit(adminId, { entityId: c.id, entityType: "confession", action: status === "approved" ? "approve_confession" : "reject_confession" });
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
        {descColumn && (
          <Field label="Description (optional)">
            <textarea className="input min-h-[4rem]" placeholder="Context shown under the question on the board."
              value={newQuestion.description} onChange={(e) => setNewQuestion({ ...newQuestion, description: e.target.value })} />
          </Field>
        )}
        <Button icon={<Plus className="w-4 h-4" />} onClick={async () => {
          if (newQuestion.question.trim().length < 3) { toast.error("Write the question."); return; }
          if (!newQuestion.asked_on) { toast.error("Choose the day it belongs to."); return; }
          const values: Record<string, unknown> = {
            author_id: adminId,
            question: newQuestion.question.trim(),
            category: newQuestion.category.trim() || null,
            asked_on: newQuestion.asked_on,
          };
          if (descColumn) values.description = newQuestion.description.trim() || null;
          const { data, error } = await db().from("daily_questions").insert(values).select().single();
          if (error || !data) { toast.error("Could not schedule it: " + (error?.message ?? "paste migration 030")); return; }
          questions.set((p) => [data as Question, ...p]);
          void audit(adminId, { entityId: (data as Question).id, entityType: "daily_question", action: "schedule_question", reason: newQuestion.asked_on });
          setNewQuestion({ question: "", category: "", description: "", asked_on: dayValue(new Date().toISOString()) });
          toast.success("Scheduled for that day.");
        }}>Schedule question</Button>

        <div className="flex flex-wrap items-center gap-2">
          <span className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input className="input pl-9" placeholder="Search questions…" value={qSearch} onChange={(e) => setQSearch(e.target.value)} />
          </span>
          <select className="input text-sm w-auto" value={qCategory} onChange={(e) => setQCategory(e.target.value)}>
            <option value="">All categories</option>
            {questionCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {questions.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nothing asked yet.</p>
        ) : shownQuestions.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No question matches that search.</p>
        ) : (
          <div className="space-y-2">
            {qPaged.shown.map((q) => {
              const own = replies.rows.filter((r) => r.question_id === q.id);
              return (
                <div key={q.id} className="p-3 rounded-xl space-y-1.5" style={{ backgroundColor: "var(--bg-main)" }}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-[12rem]">
                      <p className="font-semibold text-sm">{q.question}</p>
                      {q.description && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{q.description}</p>}
                      <p className="text-xs text-[var(--text-secondary)]">
                        {dayValue(q.asked_on)}{q.category ? ` · ${q.category}` : ""} · by @{names[q.author_id] ?? "someone"} · {own.length} {own.length === 1 ? "answer" : "answers"}
                      </p>
                    </div>
                    <Switch on={q.published} label={q.question} onChange={async (v) => {
                      setBusy(q.id);
                      const { data, error } = await db().from("daily_questions").update({ published: v }).eq("id", q.id).select("id");
                      setBusy(null);
                      if (error) { toast.error("Could not change that."); return; }
                      if (!data?.length) { toast.error("Nothing changed."); return; }
                      questions.set((p) => p.map((x) => (x.id === q.id ? { ...x, published: v } : x)));
                      void audit(adminId, { entityId: q.id, entityType: "daily_question", action: v ? "publish_question" : "unpublish_question" });
                    }} />
                    <Button size="sm" variant="ghost" onClick={() => setQDraft({ ...q })}>Edit</Button>
                    <Button size="sm" variant="ghost" loading={busy === q.id} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      onClick={async () => {
                        if (await questions.drop("id", q.id)) {
                          replies.set((p) => p.filter((r) => r.question_id !== q.id));
                          void audit(adminId, { entityId: q.id, entityType: "daily_question", action: "delete_question", reason: `${own.length} answers removed with it` });
                          toast.success("Question deleted.");
                        }
                      }}>
                      Delete
                    </Button>
                  </div>
                  {own.length > 0 && (
                    <ul className="text-xs text-[var(--text-secondary)] space-y-0.5 pl-1">
                      {own.slice(0, 6).map((r) => (
                        <li key={r.id} className="flex items-start gap-2">
                          <span className="flex-1 min-w-0">@{names[r.user_id] ?? "member"}: {r.answer}</span>
                          <button type="button" aria-label="Delete answer" className="p-0.5 rounded hover:opacity-70 flex-shrink-0"
                            onClick={async () => {
                              if (await replies.drop("id", r.id)) {
                                void audit(adminId, { targetUserId: r.user_id, entityId: r.id, entityType: "question_reply", action: "delete_answer" });
                                toast.success("Answer deleted.");
                              }
                            }}>
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </button>
                        </li>
                      ))}
                      {own.length > 6 && <li>…and {own.length - 6} more.</li>}
                    </ul>
                  )}
                </div>
              );
            })}
            <Pager page={qPaged.page} pages={qPaged.pages} total={qPaged.total} goTo={qPaged.goTo} singular="question" />
          </div>
        )}
      </Panel>

      {qDraft && (
        <Panel title="Edit daily question" hint="Only what you change here is written back. Answers are kept.">
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Question *"><input className="input" value={qDraft.question} onChange={(e) => setQDraft({ ...qDraft, question: e.target.value })} /></Field>
            <Field label="Category"><input className="input" value={qDraft.category || ""} onChange={(e) => setQDraft({ ...qDraft, category: e.target.value || null })} /></Field>
            <Field label="Asked on"><input type="date" className="input" value={dayValue(qDraft.asked_on)} onChange={(e) => setQDraft({ ...qDraft, asked_on: e.target.value })} /></Field>
          </div>
          {descColumn && (
            <Field label="Description">
              <textarea className="input min-h-[4rem]" value={qDraft.description || ""} onChange={(e) => setQDraft({ ...qDraft, description: e.target.value || null })} />
            </Field>
          )}
          <div className="flex gap-2">
            <Button loading={busy === qDraft.id} icon={<Save className="w-4 h-4" />} onClick={async () => {
              if (qDraft.question.trim().length < 3) { toast.error("Write the question."); return; }
              if (!qDraft.asked_on) { toast.error("Choose the day it belongs to."); return; }
              setBusy(qDraft.id);
              const values: Record<string, unknown> = {
                question: qDraft.question.trim(),
                category: qDraft.category?.trim() || null,
                asked_on: qDraft.asked_on,
              };
              if (descColumn) values.description = qDraft.description?.trim() || null;
              const { data, error } = await db().from("daily_questions").update(values).eq("id", qDraft.id).select().single();
              setBusy(null);
              if (error || !data) { toast.error("Nothing was saved: " + (error?.message ?? "no row came back")); return; }
              questions.set((p) => p.map((x) => (x.id === qDraft.id ? (data as Question) : x)));
              void audit(adminId, { entityId: qDraft.id, entityType: "daily_question", action: "edit_question" });
              setQDraft(null);
              toast.success("Question updated.");
            }}>Save question</Button>
            <Button variant="ghost" onClick={() => setQDraft(null)}>Cancel</Button>
          </div>
        </Panel>
      )}

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
        <span className="relative block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input className="input pl-9" placeholder="Search confession text or tag…" value={cSearch} onChange={(e) => setCSearch(e.target.value)} />
        </span>
        {shownConfessions.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nothing {confessionFilter}{cSearch.trim() ? " matching that search" : ""}.</p>
        ) : (
          <div className="space-y-2">
            {cPaged.shown.map((c) => {
              const author = authors.rows.find((a) => a.confession_id === c.id);
              return (
                <div key={c.id} className="p-3 rounded-xl space-y-1.5" style={{ backgroundColor: "var(--bg-main)" }}>
                  <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{c.body}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {c.tag ? `#${c.tag} · ` : ""}{formatRelativeTime(c.created_at)}
                    {newConfessionAuthor === c.id && (
                      <span className="ml-1 font-semibold" style={{ color: "var(--brand-gold-text)" }}>
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
                        void audit(adminId, { entityId: c.id, entityType: "confession", action: "reveal_confession_writer" });
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
                      onClick={async () => {
                        if (await confessions.drop("id", c.id)) {
                          void audit(adminId, { entityId: c.id, entityType: "confession", action: "delete_confession" });
                          toast.success("Confession deleted.");
                        }
                      }}>
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
            <Pager page={cPaged.page} pages={cPaged.pages} total={cPaged.total} goTo={cPaged.goTo} singular="confession" />
          </div>
        )}
      </Panel>

      <Panel title="Community polls" hint="One vote per person, enforced in the database. Create a poll here or leave it to members; either way the totals below are the real ballot.">
        <Notice text={polls.error} />
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Question *"><input className="input" value={newPoll.question} onChange={(e) => setNewPoll({ ...newPoll, question: e.target.value })} /></Field>
            {pollCatColumn && (
              <Field label="Category"><input className="input" placeholder="Music, football, campus…" value={newPoll.category} onChange={(e) => setNewPoll({ ...newPoll, category: e.target.value })} /></Field>
            )}
          </div>
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
              const values: Record<string, unknown> = {
                owner_id: adminId,
                question: newPoll.question.trim(),
                closes_at: newPoll.closes_at ? new Date(newPoll.closes_at).toISOString() : null,
              };
              if (pollCatColumn) values.category = newPoll.category.trim() || null;
              const { data, error } = await db().from("polls").insert(values).select().single();
              if (error || !data) { toast.error("Could not create: " + (error?.message ?? "paste migration 030")); return; }
              const poll = data as Poll;
              const { error: optError } = await db().from("poll_options")
                .insert(choices.map((label, position) => ({ poll_id: poll.id, label, position })));
              if (optError) { toast.error("The question saved but its choices did not: " + optError.message); return; }
              polls.set((p) => [poll, ...p]);
              void audit(adminId, { entityId: poll.id, entityType: "poll", action: "create_poll", reason: `${choices.length} choices` });
              setNewPoll({ question: "", category: "", closes_at: "", options: ["", "", "", ""] });
              toast.success("Poll published.");
            }}>Publish poll</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input className="input pl-9" placeholder="Search polls…" value={pSearch} onChange={(e) => setPSearch(e.target.value)} />
          </span>
          {pollCatColumn && (
            <select className="input text-sm w-auto" value={pCategory} onChange={(e) => setPCategory(e.target.value)}>
              <option value="">All categories</option>
              {pollCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {polls.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No polls yet.</p>
        ) : shownPolls.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No poll matches that search.</p>
        ) : (
          <div className="space-y-2">
            {pPaged.shown.map((pl) => {
              const its = options.rows.filter((o) => o.poll_id === pl.id).sort((a, b) => a.position - b.position);
              const cast = votes.rows.filter((v) => v.poll_id === pl.id);
              const closed = !!pl.closes_at && new Date(pl.closes_at).getTime() < Date.now();
              return (
                <div key={pl.id} className="p-3 rounded-xl space-y-1.5" style={{ backgroundColor: "var(--bg-main)" }}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-[12rem]">
                      <p className="font-semibold text-sm">{pl.question}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {pl.category ? `${pl.category} · ` : ""}by @{names[pl.owner_id] ?? "someone"} · {cast.length} vote(s)
                        {pl.closes_at ? ` · ${closed ? "closed" : "closes"} ${new Date(pl.closes_at).toLocaleString()}` : ""}
                      </p>
                    </div>
                    <Switch on={pl.published} label={pl.question} onChange={async (v) => {
                      setBusy(pl.id);
                      const { data, error } = await db().from("polls").update({ published: v }).eq("id", pl.id).select("id");
                      setBusy(null);
                      if (error) { toast.error("Could not change that."); return; }
                      if (!data?.length) { toast.error("Nothing changed."); return; }
                      polls.set((p) => p.map((x) => (x.id === pl.id ? { ...x, published: v } : x)));
                      void audit(adminId, { entityId: pl.id, entityType: "poll", action: v ? "publish_poll" : "unpublish_poll" });
                    }} />
                    <Button size="sm" variant="ghost" onClick={() => setPDraft({ ...pl })}>Edit</Button>
                    <Button size="sm" variant="ghost" loading={busy === pl.id} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      onClick={async () => {
                        if (await polls.drop("id", pl.id)) {
                          void audit(adminId, { entityId: pl.id, entityType: "poll", action: "delete_poll", reason: `${cast.length} votes removed with it` });
                          toast.success("Poll deleted.");
                        }
                      }}>
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
                          <button type="button" aria-label={`Delete choice ${o.label}`} className="p-0.5 rounded hover:opacity-70"
                            onClick={async () => {
                              if (n > 0) { toast.error("That choice already has votes — delete the whole poll instead."); return; }
                              if (await options.drop("id", o.id)) {
                                void audit(adminId, { entityId: o.id, entityType: "poll_option", action: "delete_poll_option" });
                                toast.success("Choice removed.");
                              }
                            }}>
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <Pager page={pPaged.page} pages={pPaged.pages} total={pPaged.total} goTo={pPaged.goTo} singular="poll" />
          </div>
        )}
      </Panel>

      {pDraft && (
        <Panel title="Edit poll" hint="Votes already cast are kept; the question, category and closing time are what change.">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Question *"><input className="input" value={pDraft.question} onChange={(e) => setPDraft({ ...pDraft, question: e.target.value })} /></Field>
            {pollCatColumn && (
              <Field label="Category"><input className="input" value={pDraft.category || ""} onChange={(e) => setPDraft({ ...pDraft, category: e.target.value || null })} /></Field>
            )}
            <Field label="Closes at">
              <input type="datetime-local" className="input" value={whenValue(pDraft.closes_at)}
                onChange={(e) => setPDraft({ ...pDraft, closes_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button loading={busy === pDraft.id} icon={<Save className="w-4 h-4" />} onClick={async () => {
              if (pDraft.question.trim().length < 3) { toast.error("Write the poll question."); return; }
              setBusy(pDraft.id);
              const values: Record<string, unknown> = { question: pDraft.question.trim(), closes_at: pDraft.closes_at };
              if (pollCatColumn) values.category = pDraft.category?.trim() || null;
              const { data, error } = await db().from("polls").update(values).eq("id", pDraft.id).select().single();
              setBusy(null);
              if (error || !data) { toast.error("Nothing was saved: " + (error?.message ?? "no row came back")); return; }
              polls.set((p) => p.map((x) => (x.id === pDraft.id ? (data as Poll) : x)));
              void audit(adminId, { entityId: pDraft.id, entityType: "poll", action: "edit_poll" });
              setPDraft(null);
              toast.success("Poll updated.");
            }}>Save poll</Button>
            <Button variant="ghost" onClick={() => setPDraft(null)}>Cancel</Button>
          </div>
        </Panel>
      )}

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
            void audit(adminId, { entityType: "hashtag", action: "block_hashtag", reason: `#${tag}${newTag.reason.trim() ? ` — ${newTag.reason.trim()}` : ""}` });
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
                    void audit(adminId, { entityType: "hashtag", action: "unblock_hashtag", reason: `#${b.tag}` });
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