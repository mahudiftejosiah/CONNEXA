"use client";

import { useState } from "react";
import { Calendar, Plus, Radio, Save, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";
import { uploadProMedia } from "@/lib/actions/pro";
import { db, useNames, useRows, Field, Panel, Notice, Stat, Switch, whenValue } from "./useRows";
import toast from "react-hot-toast";

type Session = {
  id: string; user_id: string; title: string; status: "live" | "ended";
  started_at: string; ended_at: string | null; clip_seq: number; created_at: string;
};
type StreamPermission = { user_id: string; allowed: boolean; note: string | null; updated_at: string };

type EventRow = {
  id: string; owner_id: string; title: string; description: string | null;
  starts_at: string; location: string | null; category: string | null;
  cover_path: string | null; published: boolean; created_at: string;
};
type Attendee = { id: string; event_id: string; user_id: string; response: "going" | "maybe" | "declined" };

export function ProLive({ adminId }: { adminId: string }) {
  const names = useNames();
  const sessions = useRows<Session>("live_sessions", { order: "started_at" });
  const permissions = useRows<StreamPermission>("stream_permissions", { order: "updated_at" });
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const live = sessions.rows.filter((s) => s.status === "live");
  const blocked = permissions.rows.filter((p) => !p.allowed);

  async function setPermission(userId: string, username: string, allowed: boolean) {
    setBusy(userId);
    const { error } = await db().from("stream_permissions").upsert(
      { user_id: userId, allowed, updated_by: adminId, note: allowed ? "Restored by an admin" : "Blocked by an admin" },
      { onConflict: "user_id" }
    );
    setBusy(null);
    if (error) { toast.error("Nothing changed — streaming permissions need migration 032."); return; }
    permissions.set((p) => {
      const rest = p.filter((x) => x.user_id !== userId);
      return [{ user_id: userId, allowed, note: null, updated_at: new Date().toISOString() }, ...rest];
    });
    await db().from("moderation_actions").insert({
      admin_id: adminId, target_user_id: userId,
      action: allowed ? "allow_streaming" : "block_streaming",
      reason: `${allowed ? "Streaming allowed" : "Streaming blocked"} for @${username}`,
    });
    toast.success(allowed ? `@${username} can broadcast again.` : `@${username} can no longer start a broadcast.`);
  }

  async function findByHandle() {
    const name = handle.trim().replace(/^@/, "");
    if (!name) return;
    const { data } = await db().from("profiles").select("id, username").ilike("username", name).limit(1);
    const row = (data ?? [])[0] as { id: string; username: string } | undefined;
    if (!row) { toast.error("No account with that username."); return; }
    await setPermission(row.id, row.username, !(permissions.rows.find((p) => p.user_id === row.id)?.allowed ?? true));
    setHandle("");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Live right now" value={live.length} />
        <Stat label="Broadcasts on record" value={sessions.rows.length} />
        <Stat label="Clips uploaded" value={sessions.rows.reduce((s, x) => s + (x.clip_seq || 0), 0)} />
        <Stat label="Blocked from streaming" value={blocked.length} />
      </div>

      <Panel title="Who may go live"
        hint="Broadcasting already requires PRO and the live_streaming switch. This adds a per-account override: block one member without touching their membership, and restore them the same way.">
        <Notice text={permissions.error} />
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Username">
            <input className="input" placeholder="username" value={handle}
              onChange={(e) => setHandle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void findByHandle(); }} />
          </Field>
          <Button loading={busy === "lookup"} onClick={() => void findByHandle()}>Block / allow</Button>
        </div>
        {permissions.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No overrides set — every PRO member may stream.</p>
        ) : (
          <div className="space-y-1.5">
            {permissions.rows.map((p) => (
              <div key={p.user_id} className="flex items-center gap-3 text-sm p-2 rounded-lg" style={{ backgroundColor: "var(--bg-main)" }}>
                <Video className="w-4 h-4 text-[var(--text-secondary)]" />
                <span className="flex-1 min-w-0">@{names[p.user_id] ?? p.user_id}</span>
                <Switch on={p.allowed} label={names[p.user_id] ?? p.user_id} onChange={(v) => void setPermission(p.user_id, names[p.user_id] ?? "", v)} />
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Broadcasts" hint="Ending a stream from here stops it for every viewer at once. The record is kept for the stats.">
        <Notice text={sessions.error} />
        {sessions.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nobody has gone live yet.</p>
        ) : (
          <div className="space-y-1.5">
            {sessions.rows.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg" style={{ backgroundColor: "var(--bg-main)" }}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === "live" ? "animate-pulse" : ""}`}
                  style={{ backgroundColor: s.status === "live" ? "#e02d2d" : "var(--border)" }} />
                <div className="flex-1 min-w-[10rem]">
                  <p className="font-semibold text-sm truncate">{s.title || "Untitled broadcast"}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    @{names[s.user_id] ?? "someone"} · started {formatRelativeTime(s.started_at)}
                    {s.ended_at ? ` · ended ${formatRelativeTime(s.ended_at)}` : ""} · {s.clip_seq || 0} clip(s)
                  </p>
                </div>
                {s.status === "live" && (
                  <Button size="sm" variant="ghost" loading={busy === s.id} icon={<Radio className="w-3.5 h-3.5" />}
                    onClick={async () => {
                      setBusy(s.id);
                      const { error } = await db().from("live_sessions")
                        .update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", s.id);
                      setBusy(null);
                      if (error) { toast.error("Could not end it — migration 032 gives admins that right."); return; }
                      sessions.set((p) => p.map((x) => (x.id === s.id ? { ...x, status: "ended", ended_at: new Date().toISOString() } : x)));
                      await db().from("moderation_actions").insert({
                        admin_id: adminId, target_user_id: s.user_id, action: "end_stream", reason: "Broadcast ended from the console",
                      });
                      toast.success("Stream ended.");
                    }}>
                    End stream
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export function ProEvents({ adminId }: { adminId: string }) {
  const names = useNames();
  const events = useRows<EventRow>("events", { order: "starts_at", ascending: true });
  const attendees = useRows<Attendee>("event_attendees");
  const [draft, setDraft] = useState<EventRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", starts_at: "", location: "", category: "", cover_path: "" });
  const [uploading, setUploading] = useState(false);

  const counts = (eventId: string) => {
    const list = attendees.rows.filter((a) => a.event_id === eventId);
    return {
      going: list.filter((a) => a.response === "going").length,
      maybe: list.filter((a) => a.response === "maybe").length,
      declined: list.filter((a) => a.response === "declined").length,
    };
  };

  async function poster(file: File | null) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("folder", "events");
    const result = await uploadProMedia(fd);
    setUploading(false);
    if ("error" in result) { toast.error(result.error); return; }
    setForm((p) => ({ ...p, cover_path: result.path }));
    toast.success("Poster uploaded.");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Events" value={events.rows.length} />
        <Stat label="Published" value={events.rows.filter((e) => e.published).length} />
        <Stat label="Going (all events)" value={attendees.rows.filter((a) => a.response === "going").length} />
        <Stat label="Upcoming" value={events.rows.filter((e) => new Date(e.starts_at).getTime() > Date.now()).length} />
      </div>

      <Panel title="Post an event" hint="The poster is stored in the same pro-media bucket as everything else, so one place holds every premium upload.">
        <Notice text={events.error} />
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Title *"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Starts at *"><input type="datetime-local" className="input" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field>
          <Field label="Location"><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Category"><input className="input" placeholder="Music, learning, sport…" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
        </div>
        <Field label="Description"><textarea className="input min-h-[5rem]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--bg-card)" }}>
            <Calendar className="w-4 h-4" />
            <span className="truncate">{uploading ? "Uploading…" : form.cover_path ? "Poster uploaded" : "Poster from your device"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { void poster(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
          <Button loading={busy === "new"} icon={<Plus className="w-4 h-4" />} onClick={async () => {
            if (form.title.trim().length < 2) { toast.error("Give the event a title."); return; }
            if (!form.starts_at) { toast.error("Choose when it starts."); return; }
            setBusy("new");
            const { data, error } = await db().from("events").insert({
              owner_id: adminId,
              title: form.title.trim(),
              description: form.description.trim() || null,
              starts_at: new Date(form.starts_at).toISOString(),
              location: form.location.trim() || null,
              category: form.category.trim() || null,
              cover_path: form.cover_path || null,
            }).select().single();
            setBusy(null);
            if (error || !data) { toast.error("Could not post it: " + (error?.message ?? "paste migration 031")); return; }
            events.set((p) => [data as EventRow, ...p]);
            setForm({ title: "", description: "", starts_at: "", location: "", category: "", cover_path: "" });
            toast.success("Event published to the hub.");
          }}>Publish event</Button>
        </div>
      </Panel>

      <Panel title="Events hub" hint="Unpublishing keeps the record and the RSVPs but hides it from members.">
        {events.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nothing scheduled.</p>
        ) : (
          <div className="space-y-2">
            {events.rows.map((e) => {
              const c = counts(e.id);
              return (
                <div key={e.id} className="p-3 rounded-xl space-y-2" style={{ backgroundColor: "var(--bg-main)" }}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-[12rem]">
                      <p className="font-semibold text-sm">{e.title}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {new Date(e.starts_at).toLocaleString()}
                        {e.location ? ` · ${e.location}` : ""}{e.category ? ` · ${e.category}` : ""} · by @{names[e.owner_id] ?? "someone"}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--brand-gold)" }}>
                        {c.going} going · {c.maybe} maybe · {c.declined} declined
                      </p>
                    </div>
                    <Switch on={e.published} label={e.title} onChange={async (v) => {
                      setBusy(e.id);
                      const { error } = await db().from("events").update({ published: v }).eq("id", e.id);
                      setBusy(null);
                      if (error) { toast.error("Could not change that."); return; }
                      events.set((p) => p.map((x) => (x.id === e.id ? { ...x, published: v } : x)));
                    }} />
                    <Button size="sm" variant="ghost" onClick={() => setDraft({ ...e })}>Edit</Button>
                    <Button size="sm" variant="ghost" loading={busy === e.id} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      onClick={async () => { if (await events.drop("id", e.id)) { attendees.set((p) => p.filter((a) => a.event_id !== e.id)); toast.success("Event deleted."); } }}>
                      Delete
                    </Button>
                  </div>
                  {draft?.id === e.id && (
                    <div className="grid sm:grid-cols-2 gap-2 pt-1">
                      <input className="input text-sm" value={draft.title} onChange={(ev) => setDraft({ ...draft, title: ev.target.value })} />
                      <input type="datetime-local" className="input text-sm" value={whenValue(draft.starts_at)} onChange={(ev) => setDraft({ ...draft, starts_at: new Date(ev.target.value).toISOString() })} />
                      <input className="input text-sm" placeholder="Location" value={draft.location || ""} onChange={(ev) => setDraft({ ...draft, location: ev.target.value || null })} />
                      <input className="input text-sm" placeholder="Category" value={draft.category || ""} onChange={(ev) => setDraft({ ...draft, category: ev.target.value || null })} />
                      <div className="sm:col-span-2 flex gap-2">
                        <Button size="sm" icon={<Save className="w-3.5 h-3.5" />} onClick={async () => {
                          setBusy(draft.id);
                          const { data, error } = await db().from("events").update({
                            title: draft.title, starts_at: draft.starts_at, location: draft.location || null,
                            category: draft.category || null, description: draft.description || null,
                          }).eq("id", draft.id).select().single();
                          setBusy(null);
                          if (error || !data) { toast.error("Nothing was saved: " + (error?.message ?? "")); return; }
                          events.set((p) => p.map((x) => (x.id === draft.id ? (data as EventRow) : x)));
                          setDraft(null);
                          toast.success("Event updated.");
                        }}>Save event</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
