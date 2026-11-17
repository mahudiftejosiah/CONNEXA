"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Mail, MapPin } from "lucide-react";
import toast from "react-hot-toast";
import { listMyEventInvites, respondToEventInvite } from "@/lib/actions/pro";
import type { InviteView } from "@/lib/actions/pro";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { Skeleton } from "@/components/ui/Skeleton";

export function EventInvites({ pro }: { pro: boolean }) {
  const router = useRouter();
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listMyEventInvites();
    if ("error" in res) { setError(res.error); setInvites([]); }
    else { setError(null); setInvites(res.invites); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function respond(id: string, status: "joined" | "dismissed") {
    setBusy(id);
    const res = await respondToEventInvite(id, status);
    setBusy(null);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(status === "joined" ? "You are going." : "Invitation declined.");
    await load();
    router.refresh();
  }

  if (loading) {
    if (!pro) return null;
    return (
      <div className="card p-4 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  // A locked visitor keeps the plain preview: the missing-migration notice is
  // only useful to somebody who could act on it.
  if (error) return pro ? <ProDataNote tone="warn">{error}</ProDataNote> : null;

  if (invites.length === 0) {
    if (!pro) return null;
    return (
      <div className="card p-4 flex items-start gap-3">
        <Mail className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "var(--text-secondary)" }} />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          No invitations waiting. When a host invites you to an event it lands here.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
        <Mail className="w-3.5 h-3.5" /> Invitations
      </h2>
      {invites.map((i) => (
        <article key={i.id} className="card p-4 space-y-2">
          <Link href={`/pro/events#event-${i.eventId}`} className="font-bold hover:underline block" style={{ color: "var(--text-primary)" }}>
            {i.title}
          </Link>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="w-4 h-4" />
              {new Date(i.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </span>
            {i.location && <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" />{i.location}</span>}
            <span>hosted by {i.hostName}</span>
          </div>
          {i.status === "invited" ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary text-sm" disabled={busy === i.id} onClick={() => void respond(i.id, "joined")}>
                Accept
              </button>
              <button type="button" className="btn-ghost text-sm border" style={{ borderColor: "var(--border)" }}
                disabled={busy === i.id} onClick={() => void respond(i.id, "dismissed")}>
                Decline
              </button>
            </div>
          ) : (
            <p className="text-xs font-bold" style={{ color: "var(--brand-gold-text)" }}>You are going to this event.</p>
          )}
        </article>
      ))}
    </section>
  );
}