"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";
import { db, useRows, useNames, usePager, Panel, Notice, Pager, Stat, audit } from "./useRows";
import toast from "react-hot-toast";

type Report = {
  id: string;
  reporter_id: string;
  entity_id: string;
  entity_type: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
};

const PREMIUM = ["confession", "poll", "question", "music", "event", "listing", "stream"];

// Where a reported thing actually lives, and which column says what it is
// called, so the administrator reads content instead of a uuid.
const SOURCE: Record<string, { table: string; label: string; hide: Record<string, unknown> }> = {
  confession: { table: "confessions", label: "body", hide: { status: "rejected" } },
  poll: { table: "polls", label: "question", hide: { published: false } },
  question: { table: "daily_questions", label: "question", hide: { published: false } },
  music: { table: "music_tracks", label: "title", hide: { published: false } },
  event: { table: "events", label: "title", hide: { published: false } },
  listing: { table: "listings", label: "title", hide: { status: "removed" } },
  stream: { table: "live_sessions", label: "title", hide: { status: "ended" } },
};

export function ProReports({ adminId }: { adminId: string }) {
  const names = useNames();
  const reports = useRows<Report>("content_reports", { order: "created_at" });
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("pending");
  const [type, setType] = useState("all");

  const rows = reports.rows
    .filter((r) => PREMIUM.includes(r.entity_type))
    .filter((r) => (status === "all" ? true : r.status === status))
    .filter((r) => (type === "all" ? true : r.entity_type === type));
  const paged = usePager(rows, 15);

  // One request per content type, only for the ids on screen's table.
  const load = useCallback(async () => {
    const live = reports.rows.filter((r) => PREMIUM.includes(r.entity_type));
    const found: Record<string, string> = {};
    const gone: string[] = [];
    for (const kind of PREMIUM) {
      const ids = Array.from(new Set(live.filter((r) => r.entity_type === kind).map((r) => r.entity_id)));
      if (ids.length === 0) continue;
      const src = SOURCE[kind];
      const { data } = await db().from(src.table).select(`id, ${src.label}`).in("id", ids);
      const seen = new Set<string>();
      for (const row of (data ?? []) as unknown as { id: string }[]) {
        seen.add(row.id);
        found[row.id] = String((row as Record<string, unknown>)[src.label] ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
      }
      for (const id of ids) if (!seen.has(id)) gone.push(id);
    }
    setBodies(found);
    setMissing(gone);
  }, [reports.rows]);

  useEffect(() => { void load(); }, [load]);

  async function decide(r: Report, next: "resolved" | "dismissed") {
    setBusy(r.id);
    const { data, error } = await db().from("content_reports")
      .update({ status: next, reviewed_by: adminId, updated_at: new Date().toISOString() })
      .eq("id", r.id).select("id");
    setBusy(null);
    if (error) { toast.error("Could not record that: " + error.message); return; }
    if (!data?.length) { toast.error("Nothing changed — that report could not be written."); return; }
    void audit(adminId, {
      entityId: r.entity_id, entityType: r.entity_type,
      action: next === "resolved" ? "report_resolved" : "report_dismissed",
      reason: `${r.entity_type} report ${next}: ${r.reason}`,
    });
    reports.set((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: next } : x)));
    toast.success(next === "resolved" ? "Marked resolved." : "Dismissed.");
  }

  async function hide(r: Report) {
    const src = SOURCE[r.entity_type];
    if (!src) return;
    setBusy(r.id);
    const { data, error } = await db().from(src.table).update(src.hide).eq("id", r.entity_id).select("id");
    if (error) { setBusy(null); toast.error("Could not take it down: " + error.message); return; }
    if (!data?.length) { setBusy(null); toast.error("That content is already gone, so there was nothing to hide."); return; }
    const { error: reportError } = await db().from("content_reports")
      .update({ status: "resolved", reviewed_by: adminId, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    setBusy(null);
    if (reportError) { toast.error("It is hidden, but the report stayed open: " + reportError.message); return; }
    void audit(adminId, {
      entityId: r.entity_id, entityType: r.entity_type,
      action: `hide_${r.entity_type}`,
      reason: `Taken down after a report: ${r.reason}`,
    });
    reports.set((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: "resolved" } : x)));
    toast.success("Taken down and the report closed.");
  }

  const pendingCount = reports.rows.filter((r) => PREMIUM.includes(r.entity_type) && r.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Premium reports waiting" value={pendingCount} />
        <Stat label="Reported content we can no longer find" value={missing.length} />
        <Stat label="Reports on file" value={reports.rows.length} />
        <Stat label="Kinds reported" value={new Set(reports.rows.filter((r) => PREMIUM.includes(r.entity_type)).map((r) => r.entity_type)).size} />
      </div>

      <Panel title="Reported premium content" hint="What members have flagged across confessions, polls, questions, music, events and listings. Hiding something here unpublishes the real row and writes it to the audit log.">
        <Notice text={reports.error} />
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Report status">
            <option value="pending">Waiting</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="all">Every status</option>
          </select>
          <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Content type">
            <option value="all">Every kind</option>
            {PREMIUM.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => void reports.reload()}>Check again</Button>
        </div>

        {reports.loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nothing reported here right now. A member uses the report button on a confession, poll, question, track, event or listing and it arrives in this list.</p>
        ) : (
          <>
            <div className="space-y-3">
              {paged.shown.map((r) => (
                <div key={r.id} className="p-3 rounded-xl border" style={{ borderColor: "var(--border)" }}>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <ShieldAlert className="w-4 h-4" style={{ color: "var(--brand-gold)" }} />
                    <span className="font-semibold uppercase tracking-wide">{r.entity_type}</span>
                    <span>· reported by {names[r.reporter_id] ? `@${names[r.reporter_id]}` : "a member"}</span>
                    <span>· {formatRelativeTime(r.created_at)}</span>
                    <span className="ml-auto font-semibold">{r.status}</span>
                  </div>
                  <p className="text-sm mt-1.5 font-semibold" style={{ color: "var(--text-primary)" }}>{r.reason}</p>
                  {r.details && r.details !== r.reason && (
                    <p className="text-xs mt-0.5 text-[var(--text-secondary)]">{r.details}</p>
                  )}
                  <p className="text-sm mt-2 pl-3 border-l-2" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                    {bodies[r.entity_id] ?? "This content is no longer in the database — it was deleted, or it was never published."}
                  </p>
                  {r.status === "pending" && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Button size="sm" variant="ghost" loading={busy === r.id} onClick={() => void decide(r, "dismissed")}>Dismiss</Button>
                      <Button size="sm" variant="ghost" loading={busy === r.id} onClick={() => void decide(r, "resolved")}>Mark resolved</Button>
                      <Button size="sm" loading={busy === r.id} onClick={() => void hide(r)}>Take it down</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Pager page={paged.page} pages={paged.pages} total={paged.total} goTo={paged.goTo} singular="report" />
          </>
        )}
      </Panel>
    </div>
  );
}
