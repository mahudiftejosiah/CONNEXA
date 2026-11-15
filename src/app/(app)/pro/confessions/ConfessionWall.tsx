"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, Ghost, ShieldOff } from "lucide-react";
import toast from "react-hot-toast";
import { reportConfession, submitConfession } from "@/lib/actions/pro";
import { formatRelativeTime } from "@/lib/utils";

type Confession = { id: string; body: string; tag: string | null; created_at: string };

export function ConfessionWall({
  confessions,
  myIds,
  waiting,
  canSend,
}: {
  confessions: Confession[];
  myIds: string[];
  waiting: number;
  canSend: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [tag, setTag] = useState("");
  const [reported, setReported] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const mine = new Set(myIds);

  function send() {
    if (body.trim().length < 5) { toast.error("A confession needs at least five characters."); return; }
    start(async () => {
      const res = await submitConfession(body, tag);
      if ("error" in res) { toast.error(res.error); return; }
      setBody("");
      setTag("");
      toast.success(res.message ?? "Sent.");
      router.refresh();
    });
  }

  function report(id: string) {
    start(async () => {
      const res = await reportConfession(id, reason);
      if ("error" in res) { toast.error(res.error); return; }
      setReported(null);
      setReason("");
      toast.success(res.message ?? "Reported.");
    });
  }

  return (
    <div className="space-y-4">
      {canSend ? (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldOff className="w-4 h-4" style={{ color: "var(--brand-gold)" }} />
            <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>Confess something</h2>
          </div>
          <textarea
            className="input min-h-[90px] resize-y"
            maxLength={1500}
            placeholder="Nobody will be shown who wrote this."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 items-center">
            <input className="input max-w-[180px]" maxLength={40} placeholder="Topic (optional)"
              value={tag} onChange={(e) => setTag(e.target.value)} />
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{body.length}/1500</span>
            <button type="button" className="btn-primary text-sm ml-auto" disabled={pending} onClick={send}>
              Send anonymously
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            A moderator reads each one before it reaches the wall. Abusive confessions are rejected, and repeated abuse is what gets an account limited — not the confession itself.
          </p>
        </div>
      ) : (
        <div className="card p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
          Sending a confession is part of PRO.{" "}
          <a href="/pro" style={{ color: "var(--brand-gold)", fontWeight: 700 }}>Upgrade to PRO</a>.
        </div>
      )}

      {waiting > 0 && (
        <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          {waiting} of {waiting === 1 ? "your confession is" : "your confessions are"} waiting for a moderator.
        </p>
      )}

      {confessions.length === 0 ? (
        <div className="card p-8 text-center space-y-2">
          <Ghost className="w-8 h-8 mx-auto" style={{ color: "var(--text-secondary)" }} />
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>The wall is empty</p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Nothing has been approved yet.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {confessions.map((c) => (
            <article key={c.id} className="card p-4 flex flex-col gap-2">
              <p className="text-sm leading-relaxed whitespace-pre-wrap flex-1" style={{ color: "var(--text-primary)" }}>{c.body}</p>
              <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: "var(--text-secondary)" }}>
                {c.tag && (
                  <span className="px-2 py-0.5 rounded-full font-bold" style={{ background: "var(--border)", color: "var(--text-secondary)" }}>
                    {c.tag}
                  </span>
                )}
                <span>{formatRelativeTime(c.created_at)}</span>
                {mine.has(c.id) && <span style={{ color: "var(--brand-gold)", fontWeight: 700 }}>yours</span>}
                <button type="button" className="ml-auto inline-flex items-center gap-1 font-semibold"
                  style={{ color: "#ef4444" }} onClick={() => setReported(reported === c.id ? null : c.id)}>
                  <Flag className="w-3.5 h-3.5" /> Report
                </button>
              </div>
              {reported === c.id && (
                <div className="flex gap-2">
                  <input className="input" placeholder="What is wrong with it?" maxLength={200}
                    value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button type="button" className="btn-primary text-sm" disabled={pending} onClick={() => report(c.id)}>Send</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
