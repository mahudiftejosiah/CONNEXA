"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw, Search, Swords } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { formatRelativeTime } from "@/lib/utils";
import { cancelDuel, challengeToQuiz, listQuizFriends, respondToDuel, type DuelView } from "@/lib/actions/pro";

type Friend = { id: string; name: string; username: string };
type Scores = { requesterScore: number | null; opponentScore: number | null };

const STATUS_LABEL: Record<DuelView["status"], string> = {
  pending: "Pending",
  accepted: "Accepted",
  played: "Played",
  declined: "Declined",
  cancelled: "Withdrawn",
};

// The database marks a duel played as soon as one side finishes, so the status
// alone cannot say whether this member still has a round to play: their own
// score does.
function needsYou(d: DuelView): boolean {
  if (d.status === "pending") return true;
  return (d.status === "accepted" || d.status === "played") && !d.played;
}

// The status column alone is misleading: it turns played after the first round
// and stays accepted after the second, so the two scores say what really happened.
function statusLabel(d: DuelView): string {
  if (d.status === "pending" || d.status === "declined" || d.status === "cancelled") return STATUS_LABEL[d.status];
  if (d.requesterScore !== null && d.opponentScore !== null) return "Played";
  if (d.requesterScore !== null || d.opponentScore !== null) return "In progress";
  return STATUS_LABEL[d.status];
}

export function duelVerdict(d: DuelView, fresh?: Scores | null, myScore?: number): string {
  const requester = fresh ? fresh.requesterScore : d.requesterScore;
  const opponent = fresh ? fresh.opponentScore : d.opponentScore;
  const mine = (d.side === "requester" ? requester : opponent) ?? myScore ?? null;
  const theirs = d.side === "requester" ? opponent : requester;
  const other = d.side === "requester" ? d.opponentName : d.requesterName;

  if (d.status === "declined") return `${other} declined the challenge.`;
  if (d.status === "cancelled") return d.side === "requester" ? "You withdrew the challenge." : `${other} withdrew the challenge.`;
  if (mine === null) return "You have not played this round yet.";
  if (theirs === null) return `You scored ${mine}. Waiting for ${other} to play.`;
  if (mine > theirs) return `You won ${mine}–${theirs} against ${other}.`;
  if (mine < theirs) return `${other} won ${theirs}–${mine}.`;
  return `A draw: ${mine}–${theirs} with ${other}.`;
}

export function ChallengePicker({ quizId, quizTitle, onClose, onSent }: {
  quizId: string;
  quizTitle: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await listQuizFriends();
        if (!alive) return;
        if ("error" in res) { setLoadError(res.error); setFriends([]); }
        else { setLoadError(null); setFriends(res.friends); }
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : "Your friends list could not be read.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, []);

  const needle = query.trim().toLowerCase().replace(/^@/, "");
  const shown = needle
    ? friends.filter((f) => f.name.toLowerCase().includes(needle) || f.username.toLowerCase().includes(needle))
    : friends;

  async function send() {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await challengeToQuiz(quizId, picked);
      if ("error" in res) { setFeedback({ ok: false, text: res.error }); return; }
      setFeedback({ ok: true, text: res.message });
      onSent();
    } catch (e) {
      setFeedback({ ok: false, text: e instanceof Error ? e.message : "That challenge could not be sent." });
    } finally {
      setBusy(false);
    }
  }

  const sent = feedback?.ok === true;

  return (
    <Modal open onClose={onClose} title="Challenge a friend" size="md">
      <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
        {quizTitle} · you both play the same timed round, and the database keeps each score.
      </p>

      {loading ? (
        <p className="text-sm py-6 text-center" style={{ color: "var(--text-secondary)" }}>Loading your friends…</p>
      ) : loadError ? (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          {loadError}
        </div>
      ) : friends.length === 0 ? (
        <div className="py-6 text-center space-y-2">
          <Swords className="w-7 h-7 mx-auto" style={{ color: "var(--text-secondary)" }} />
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>No friends to challenge yet</p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            A duel needs two people who are already friends.{" "}
            <a href="/search" style={{ color: "var(--brand-gold-text)", fontWeight: 700 }}>Find people on CONNEXA</a>.
          </p>
        </div>
      ) : (
        <>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-secondary)" }} />
            <input
              type="search"
              className="input pl-9 text-sm"
              placeholder="Search friends by name or @username…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search friends to challenge"
            />
          </div>
          {shown.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: "var(--text-secondary)" }}>
              No friend matches that search. Try part of their name or @username.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {shown.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { setPicked(f.id); setFeedback(null); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left"
                  style={{
                    borderColor: picked === f.id ? "var(--brand-gold)" : "var(--border)",
                    background: picked === f.id ? "rgb(var(--b-400) / 0.12)" : "transparent",
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{f.name}</span>
                    <span className="block text-xs truncate" style={{ color: "var(--text-secondary)" }}>@{f.username}</span>
                  </span>
                  {picked === f.id && <Check className="w-4 h-4 flex-shrink-0" style={{ color: "var(--brand-gold-text)" }} />}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {feedback && (
        <p
          className="text-sm mt-3 rounded-xl border px-3 py-2"
          style={{ borderColor: feedback.ok ? "var(--brand-gold)" : "var(--border)", color: feedback.ok ? "var(--text-primary)" : "#ef4444" }}
        >
          {feedback.text}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 mt-4">
        {!sent && <button type="button" className="btn-ghost text-sm" onClick={onClose}>Cancel</button>}
        {(friends.length > 0 || sent) && (
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={!sent && (!picked || busy)}
            onClick={sent ? onClose : () => void send()}
          >
            {sent ? "Done" : busy ? "Sending…" : "Send challenge"}
          </button>
        )}
      </div>
    </Modal>
  );
}

export function DuelInbox({ duels, note, loading, canPlay, onPlay, onChanged }: {
  duels: DuelView[];
  note: string | null;
  loading: boolean;
  canPlay: boolean;
  onPlay: (duel: DuelView) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function answer(duel: DuelView, accept: boolean) {
    setBusy(duel.id);
    setFailed(null);
    try {
      const res = await respondToDuel(duel.id, accept);
      if ("error" in res) { setFailed(res.error); toast.error(res.error); return; }
      toast.success(accept ? "Accepted. Play your round when you are ready." : "Challenge declined.");
      onChanged();
    } catch (e) {
      const message = e instanceof Error ? e.message : "That challenge could not be answered.";
      setFailed(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(duel: DuelView) {
    setBusy(duel.id);
    setFailed(null);
    try {
      const res = await cancelDuel(duel.id);
      if ("error" in res) { setFailed(res.error); toast.error(res.error); return; }
      toast.success("Challenge withdrawn.");
      onChanged();
    } catch (e) {
      const message = e instanceof Error ? e.message : "That challenge could not be withdrawn.";
      setFailed(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  const open = duels.filter(needsYou);
  const settled = duels.filter((d) => !needsYou(d));

  return (
    <section className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Swords className="w-4 h-4 flex-shrink-0" style={{ color: "var(--brand-gold)" }} />
        <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>Friend challenges</h2>
        <button type="button" className="btn-ghost text-xs ml-auto" disabled={loading} onClick={onChanged}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {note && (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          {note} Solo rounds below still work.
        </div>
      )}
      {failed && <p className="text-sm" style={{ color: "#ef4444" }}>{failed}</p>}
      {loading && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading…</p>}

      {!loading && duels.length === 0 && !note && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {canPlay
            ? "No challenges yet. Open a quiz below and use Challenge a friend to start a timed duel."
            : "Friend challenges are part of PRO, and so is playing them."}
        </p>
      )}

      {open.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Needs you</p>
          {open.map((d) => {
            const other = d.side === "requester" ? d.opponentName : d.requesterName;
            return (
              <div key={d.id} className="rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-semibold text-sm min-w-0 flex-1" style={{ color: "var(--text-primary)" }}>{d.quizTitle}</p>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full border flex-shrink-0"
                    style={{ borderColor: "var(--border)", color: "var(--brand-gold-text)" }}>
                    {statusLabel(d)}
                  </span>
                </div>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {d.side === "requester" ? `You challenged ${other}` : `${other} challenged you`} · {formatRelativeTime(d.requestedAt)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {d.status === "pending" && d.side === "opponent" && (
                    <>
                      <button type="button" className="btn-primary text-sm" disabled={busy === d.id} onClick={() => void answer(d, true)}>Accept</button>
                      <button type="button" className="btn-ghost text-sm" disabled={busy === d.id} onClick={() => void answer(d, false)}>Decline</button>
                    </>
                  )}
                  {d.status === "pending" && d.side === "requester" && (
                    <button type="button" className="btn-ghost text-sm" disabled={busy === d.id} onClick={() => void withdraw(d)}>Withdraw</button>
                  )}
                  {d.status !== "pending" && (
                    <button type="button" className="btn-primary text-sm" disabled={!canPlay || busy === d.id} onClick={() => onPlay(d)}>
                      Play your round
                    </button>
                  )}
                  {!canPlay && d.status !== "pending" && (
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Playing needs an active PRO membership.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {settled.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>History</p>
          {settled.map((d) => {
            const other = d.side === "requester" ? d.opponentName : d.requesterName;
            return (
              <div key={d.id} className="rounded-xl border p-3 space-y-1" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-semibold text-sm min-w-0 flex-1" style={{ color: "var(--text-primary)" }}>{d.quizTitle}</p>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full border flex-shrink-0"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                    {statusLabel(d)}
                  </span>
                </div>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{duelVerdict(d)}</p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {d.side === "requester" ? `You vs ${other}` : `${other} vs you`} · {formatRelativeTime(d.finishedAt ?? d.requestedAt)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}