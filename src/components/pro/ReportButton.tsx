"use client";

import { useState, useTransition } from "react";
import { Check, Flag } from "lucide-react";
import toast from "react-hot-toast";
import { reportPremiumItem } from "@/lib/actions/pro";
import { cn } from "@/lib/utils";

// The admin queue prints `reason` as the headline and `details` underneath, so
// the preset goes first and the member's own words follow it.
const REASONS = [
  "Spam or a scam",
  "Harassment or hate",
  "Sexual or explicit",
  "Misleading or false",
  "Stolen or copyrighted",
  "Something else",
];

export function ReportButton({
  entityType,
  entityId,
  className,
}: {
  entityType: "poll" | "question" | "music" | "event" | "listing";
  entityId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [detail, setDetail] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function send() {
    const text = detail.trim() ? `${reason} — ${detail.trim()}` : reason;
    start(async () => {
      const res = await reportPremiumItem(entityType, entityId, text);
      if ("error" in res) { setFailed(res.error); toast.error(res.error); return; }
      setFailed(null);
      setDone(true);
      setOpen(false);
      setDetail("");
      toast.success(res.message);
    });
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex justify-end">
        <button
          type="button"
          disabled={done || pending}
          aria-expanded={open}
          onClick={() => { setFailed(null); setOpen((v) => !v); }}
          className="text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-60"
          style={{ color: done ? "var(--text-secondary)" : "#ef4444" }}
        >
          {done ? <Check className="w-3.5 h-3.5" /> : <Flag className="w-3.5 h-3.5" />}
          {done ? "Reported" : "Report"}
        </button>
      </div>

      {open && !done && (
        <div className="mt-2 rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
            What is wrong with it?
          </p>
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Report reason">
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <textarea
            className="input min-h-[64px] resize-y"
            maxLength={400}
            placeholder="Add detail (optional)"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
          {failed && <p className="text-xs font-semibold" style={{ color: "#ef4444" }}>{failed}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary text-sm" disabled={pending} onClick={send}>Send report</button>
            <button type="button" className="btn-ghost text-sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}