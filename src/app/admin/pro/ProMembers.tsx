"use client";

import { useState } from "react";
import { Crown, Search, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";
import { hasActivePro } from "@/lib/pro";
import { db, useRows, usePager, useNames, Panel, Notice, Stat, Switch, Pager, audit, dayValue } from "./useRows";
import toast from "react-hot-toast";

type Member = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  pro_expires_at: string | null;
  created_at: string;
};

type FeatureRow = {
  key: string;
  label: string;
  description: string;
  bucket: string;
  enabled: boolean;
  sort: number;
};

type AuditRow = {
  id: string;
  admin_id: string;
  target_user_id: string | null;
  action: string;
  reason: string | null;
  created_at: string;
};

const BUCKETS: { key: string; label: string }[] = [
  { key: "identity", label: "Identity and analytics" },
  { key: "community", label: "Social and community" },
  { key: "entertainment", label: "Entertainment" },
  { key: "creator", label: "Creator and lifestyle" },
];

export function ProMembers({ adminId }: { adminId: string }) {
  const members = useRows<Member>("profiles", { order: "created_at", or: "is_verified.eq.true,pro_expires_at.not.null" });
  const features = useRows<FeatureRow>("pro_features", { order: "sort", ascending: true });
  const names = useNames();
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [lookup, setLookup] = useState("");
  const [found, setFound] = useState<Member | null>(null);
  const [searching, setSearching] = useState(false);
  const [customDate, setCustomDate] = useState<{ id: string; value: string } | null>(null);

  const pro = members.rows.filter((m) => hasActivePro(m));
  const expiring = pro.filter((m) => {
    if (!m.pro_expires_at) return false;
    const days = (new Date(m.pro_expires_at).getTime() - Date.now()) / 86_400_000;
    return days <= 7;
  });
  const lapsed = members.rows.filter((m) => m.is_verified && !hasActivePro(m));
  // An account that once held PRO and no longer carries the tick: either the
  // end date passed or an administrator pulled it. Both read as cancelled here.
  const cancelled = members.rows.filter((m) => !m.is_verified && m.pro_expires_at);

  const [status, setStatus] = useState<"all" | "active" | "ending" | "lapsed" | "cancelled">("all");
  const visible = members.rows
    .filter((m) => m.is_verified || m.pro_expires_at)
    .filter((m) => {
      if (status === "active") return hasActivePro(m);
      if (status === "ending") return hasActivePro(m) && !!m.pro_expires_at
        && (new Date(m.pro_expires_at).getTime() - Date.now()) / 86_400_000 <= 7;
      if (status === "lapsed") return m.is_verified && !hasActivePro(m);
      if (status === "cancelled") return !m.is_verified && !!m.pro_expires_at;
      return true;
    })
    .filter((m) => {
      const q = term.trim().toLowerCase();
      return !q || m.username.toLowerCase().includes(q) || m.display_name.toLowerCase().includes(q);
    });
  const paged = usePager(visible, 20);
  const activity = useRows<AuditRow>("moderation_actions", { order: "created_at", or: "entity_type.eq.pro_membership" });
  const pagedActivity = usePager(activity.rows, 10);

  async function setExpiry(m: Member, expiresAt: string | null, note: string) {
    setBusy(m.id);
    const { error } = await db().from("profiles").update({ pro_expires_at: expiresAt }).eq("id", m.id);
    setBusy(null);
    if (error) { toast.error("Nothing changed — profiles may not be writable until migration 027 is pasted."); return; }
    members.set((prev) => prev.map((x) => (x.id === m.id ? { ...x, pro_expires_at: expiresAt } : x)));
    await audit(adminId, { targetUserId: m.id, action: "set_pro_expiry", reason: note, entityType: "pro_membership" });
    toast.success(note);
  }

  async function setVerified(m: Member, next: boolean) {
    setBusy(m.id);
    const { error } = await db().from("profiles").update({ is_verified: next }).eq("id", m.id);
    setBusy(null);
    if (error) { toast.error("Could not change the badge."); return; }
    members.set((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_verified: next } : x)));
    await audit(adminId, {
      targetUserId: m.id,
      action: next ? "grant_pro" : "revoke_pro",
      reason: next ? `PRO badge granted to @${m.username}` : `PRO badge removed from @${m.username}`,
      entityType: "pro_membership",
    });
    toast.success(next ? `@${m.username} now has PRO.` : `PRO removed from @${m.username}.`);
  }

  async function findUser() {
    const name = lookup.trim().replace(/^@/, "");
    if (!name) return;
    setSearching(true);
    const { data } = await db().from("profiles").select("*").ilike("username", name).limit(1);
    setSearching(false);
    const row = (data ?? [])[0] as Member | undefined;
    if (!row) { toast.error("No account with that username."); setFound(null); return; }
    setFound(row);
    if (!members.rows.some((m) => m.id === row.id)) members.set((p) => [row, ...p]);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Active PRO members" value={pro.length} />
        <Stat label="Ending within 7 days" value={expiring.length} />
        <Stat label="Lapsed but still ticked" value={lapsed.length} />
        <Stat label="Cancelled" value={cancelled.length} />
        <Stat label="Ever held PRO" value={members.rows.length} />
      </div>

      <Panel title="Find an account" hint="Type a username to jump to it, whether or not it already holds PRO.">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input className="input pl-9" placeholder="username" value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void findUser(); }} />
          </div>
          <Button loading={searching} onClick={() => void findUser()}>Find</Button>
        </div>
        {found && (
          <div className="flex items-center gap-3 pt-1">
            <Avatar src={found.avatar_url} name={found.display_name} size={32} />
            <div className="text-sm">
              <p className="font-semibold">@{found.username}</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {hasActivePro(found) ? "PRO active" : found.is_verified ? "Tick only, PRO expired" : "No PRO"}
                {found.pro_expires_at ? ` · ends ${dayValue(found.pro_expires_at)}` : ""}
              </p>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="PRO members" hint="The gold badge and every premium gate read these two values, so changing them here changes the site at once.">
        <Notice text={members.error} />
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1 min-w-[12rem]" placeholder="Filter by name or username" value={term} onChange={(e) => setTerm(e.target.value)} />
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Subscription status">
            <option value="all">Every status</option>
            <option value="active">Active</option>
            <option value="ending">Ending within 7 days</option>
            <option value="lapsed">Past its end date</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {members.loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nobody holds PRO yet. Find an account above and grant it.</p>
        ) : (
          <div className="divide-y divide-[var(--border)] rail">
            {paged.shown.map((m) => (
              <div key={m.id} className="py-3 flex flex-wrap items-center gap-3 min-w-[40rem]">
                <Avatar src={m.avatar_url} name={m.display_name} size={36} />
                <div className="flex-1 min-w-[10rem]">
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    {m.display_name}
                    {hasActivePro(m) && <Crown className="w-3.5 h-3.5" style={{ color: "var(--brand-gold)" }} />}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    @{m.username} · {m.pro_expires_at
                      ? (hasActivePro(m) ? `ends ${new Date(m.pro_expires_at).toLocaleDateString()}` : `lapsed ${new Date(m.pro_expires_at).toLocaleDateString()}`)
                      : m.is_verified ? "no end date" : "no PRO"}
                    {" · "}
                    {formatRelativeTime(m.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[30, 90, 365].map((d) => (
                    <Button key={d} size="sm" variant="ghost" loading={busy === m.id}
                      onClick={() => void setExpiry(m, new Date(Date.now() + d * 86_400_000).toISOString(), `+${d} days for @${m.username}`)}>
                      +{d}d
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => { setCustomDate({ id: m.id, value: dayValue(m.pro_expires_at) || "" }); }}>Date…</Button>
                  {customDate?.id === m.id && (
                    <span className="flex items-center gap-1.5">
                      <input type="date" className="input text-sm w-[9.5rem]" value={customDate.value}
                        onChange={(e) => setCustomDate({ id: m.id, value: e.target.value })} />
                      <Button size="sm" loading={busy === m.id}
                        onClick={() => {
                          const iso = customDate.value ? new Date(`${customDate.value}T23:59:59`).toISOString() : null;
                          void setExpiry(m, iso, iso ? `PRO ends ${customDate.value} for @${m.username}` : `End date cleared for @${m.username}`);
                          setCustomDate(null);
                        }}>Set</Button>
                    </span>
                  )}
                  {m.is_verified ? (
                    <Button size="sm" variant="ghost" loading={busy === m.id} onClick={() => void setVerified(m, false)}>Revoke PRO</Button>
                  ) : (
                    <Button size="sm" loading={busy === m.id} onClick={() => void setVerified(m, true)}>Grant PRO</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <Pager page={paged.page} pages={paged.pages} total={paged.total} goTo={paged.goTo} singular="account" />
      </Panel>

      <Panel title="Feature switches" hint="Turning one off hides the feature from every account and blocks it at the database, not just in the page.">
        <Notice text={features.error} />
        {features.loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : features.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No feature rows yet — paste migration 029 to seed the thirteen switches.</p>
        ) : (
          <div className="space-y-5">
            {BUCKETS.map((bucket) => {
              const list = features.rows.filter((f) => f.bucket === bucket.key);
              if (list.length === 0) return null;
              return (
                <div key={bucket.key}>
                  <p className="text-xs font-bold uppercase tracking-wide mb-2">{bucket.label}</p>
                  <div className="space-y-2">
                    {list.map((f) => (
                      <FeatureEditor key={f.key} adminId={adminId} feature={f} onSaved={(next) => features.set((p) => p.map((x) => (x.key === next.key ? next : x)))} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Subscription activity" hint="Every grant, removal and end-date change made from this console, newest first.">
        <Notice text={activity.error} />
        {activity.rows.length === 0 && !activity.loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Nothing recorded yet.</p>
        ) : (
          <>
            <div className="divide-y divide-[var(--border)]">
              {pagedActivity.shown.map((a) => (
                <div key={a.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-[var(--text-primary)]">{a.reason ?? a.action}</span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {names[a.admin_id] ? `@${names[a.admin_id]}` : "an administrator"} · {formatRelativeTime(a.created_at)}
                  </span>
                </div>
              ))}
            </div>
            <Pager page={pagedActivity.page} pages={pagedActivity.pages} total={pagedActivity.total} goTo={pagedActivity.goTo} singular="entry" />
          </>
        )}
      </Panel>
    </div>
  );
}

function FeatureEditor({ adminId, feature, onSaved }: { adminId: string; feature: FeatureRow; onSaved: (next: FeatureRow) => void }) {
  const [draft, setDraft] = useState(feature);
  const [busy, setBusy] = useState(false);
  const dirty = draft.label !== feature.label || draft.description !== feature.description;

  async function save(enabled: boolean, label = draft.label, description = draft.description) {
    setBusy(true);
    const { data, error } = await db().from("pro_features")
      .update({ enabled, label, description }).eq("key", feature.key).select().single();
    setBusy(false);
    if (error || !data) { toast.error("The switch did not move: " + (error?.message ?? "")); return; }
    const next = data as FeatureRow;
    setDraft(next);
    onSaved(next);
    if (next.enabled !== feature.enabled) {
      await audit(adminId, {
        action: next.enabled ? "enable_pro_feature" : "disable_pro_feature",
        entityId: next.key, entityType: "pro_feature",
        reason: `${next.label} switched ${next.enabled ? "on" : "off"} for every account`,
      });
    }
    if (next.label !== feature.label || next.description !== feature.description) {
      await audit(adminId, {
        action: "edit_pro_feature", entityId: next.key, entityType: "pro_feature",
        reason: `Copies changed for ${next.key}`,
      });
    }
    toast.success(enabled ? `${next.label} is on.` : `${next.label} is off for everyone.`);
  }

  return (
    <div className="flex flex-wrap items-start gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--bg-main)" }}>
      <Switch on={feature.enabled} onChange={(v) => void save(v)} label={feature.label} />
      <div className="flex-1 min-w-[14rem] space-y-1.5">
        <input className="input text-sm font-semibold" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        <input className="input text-xs" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <p className="text-[11px] font-mono text-[var(--text-secondary)]">{feature.key}</p>
      </div>
      {dirty && (
        <Button size="sm" loading={busy} icon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => void save(feature.enabled)}>Save text</Button>
      )}
    </div>
  );
}
