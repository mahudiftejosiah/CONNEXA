"use client";

import { useEffect, useState } from "react";
import { Calendar, Image as ImageIcon, Plus, Radio, Save, Search, Trash2, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";
import { uploadProMediaFile } from "@/lib/media";
import { db, useNames, useRows, audit, Field, Panel, Notice, Stat, Switch, whenValue, usePager, Pager } from "./useRows";
import toast from "react-hot-toast";

type Session = {
  id: string; user_id: string; title: string; status: "scheduled" | "live" | "ended";
  started_at: string; ended_at: string | null; scheduled_at: string | null;
  clip_seq: number; created_at: string;
};
type StreamPermission = { user_id: string; allowed: boolean; note: string | null; updated_at: string };

type EventRow = {
  id: string; owner_id: string; title: string; description: string | null;
  starts_at: string; ends_at?: string | null; location: string | null; category: string | null;
  cover_path: string | null; banner_path?: string | null; published: boolean; created_at: string;
};
type Attendee = { id: string; event_id: string; user_id: string; response: "going" | "maybe" | "declined" };

function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:/i.test(path)) return path;
  return db().storage.from("pro-media").getPublicUrl(path).data.publicUrl;
}

function matches(haystack: string, term: string) {
  const t = term.trim().toLowerCase();
  return !t || haystack.toLowerCase().includes(t);
}

export function ProLive({ adminId }: { adminId: string }) {
  const names = useNames();
  const sessions = useRows<Session>("live_sessions", { order: "started_at" });
  const permissions = useRows<StreamPermission>("stream_permissions", { order: "updated_at" });
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "live" | "scheduled" | "ended">("all");
  const [search, setSearch] = useState("");

  const live = sessions.rows.filter((s) => s.status === "live");
  const scheduled = sessions.rows.filter((s) => s.status === "scheduled");
  const shown = sessions.rows.filter((s) =>
    (filter === "all" || s.status === filter) && matches(s.title + " " + (names[s.user_id] ?? ""), search));
  const paged = usePager(shown, 15);
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
    await audit(adminId, {
      targetUserId: userId,
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

  async function endStream(s: Session) {
    setBusy(s.id);
    const endedAt = new Date().toISOString();
    const { data, error } = await db().from("live_sessions").update({ status: "ended", ended_at: endedAt }).eq("id", s.id).select("id");
    setBusy(null);
    if (error) { toast.error("Could not end it — migration 032 gives admins that right."); return; }
    if (!data?.length) { toast.error("That broadcast had already finished."); return; }
    sessions.set((p) => p.map((x) => (x.id === s.id ? { ...x, status: "ended", ended_at: endedAt } : x)));
    await audit(adminId, {
      targetUserId: s.user_id, entityId: s.id, entityType: "stream",
      action: "end_stream", reason: "Broadcast ended from the console",
    });
    toast.success("Stream ended.");
  }

  async function cancelSchedule(s: Session) {
    setBusy(s.id);
    const gone = await sessions.drop("id", s.id);
    setBusy(null);
    if (!gone) return;
    await audit(adminId, {
      targetUserId: s.user_id, entityId: s.id, entityType: "stream",
      action: "cancel_scheduled_stream", reason: "Scheduled broadcast cancelled from the console",
    });
    toast.success("Schedule cancelled.");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat label="Live right now" value={live.length} />
        <Stat label="Scheduled" value={scheduled.length} />
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

      <Panel title="Broadcasts" hint="Ending a stream from here stops it for every viewer at once; cancelling a schedule removes it from the Go Live page. The record is kept for the stats.">
        <Notice text={sessions.error} />
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" value={filter} aria-label="Broadcast status"
            onChange={(e) => setFilter(e.target.value as "all" | "live" | "scheduled" | "ended")}>
            <option value="all">Every status</option>
            <option value="live">Live now</option>
            <option value="scheduled">Scheduled</option>
            <option value="ended">Ended</option>
          </select>
          <Button size="sm" variant="ghost" onClick={() => void sessions.reload()}>Check again</Button>
          <span className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input className="input pl-9" placeholder="Search title or broadcaster…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </span>
        </div>
        {sessions.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nobody has gone live yet.</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No broadcast matches that filter.</p>
        ) : (
          <div className="space-y-1.5">
            {paged.shown.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg" style={{ backgroundColor: "var(--bg-main)" }}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === "live" ? "animate-pulse" : ""}`}
                  style={{ backgroundColor: s.status === "live" ? "#e02d2d" : s.status === "scheduled" ? "var(--brand-gold)" : "var(--border)" }} />
                <div className="flex-1 min-w-[10rem]">
                  <p className="font-semibold text-sm truncate">{s.title || "Untitled broadcast"}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    @{names[s.user_id] ?? "someone"}
                    {s.status === "scheduled"
                      ? ` · scheduled for ${s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : "a time not set"}`
                      : ` · started ${formatRelativeTime(s.started_at)}`}
                    {s.ended_at ? ` · ended ${formatRelativeTime(s.ended_at)}` : ""} · {s.clip_seq || 0} clip(s)
                  </p>
                </div>
                {s.status === "scheduled" && (
                  <Button size="sm" variant="ghost" loading={busy === s.id} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                    onClick={() => void cancelSchedule(s)}>
                    Cancel schedule
                  </Button>
                )}
                {s.status === "live" && (
                  <Button size="sm" variant="ghost" loading={busy === s.id} icon={<Radio className="w-3.5 h-3.5" />}
                    onClick={() => void endStream(s)}>
                    End stream
                  </Button>
                )}
              </div>
            ))}
            <Pager page={paged.page} pages={paged.pages} total={paged.total} goTo={paged.goTo} singular="broadcast" />
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
  const [form, setForm] = useState({ title: "", description: "", starts_at: "", ends_at: "", location: "", category: "", cover_path: "", banner_path: "" });
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [extraColumns, setExtraColumns] = useState(false);

  // Migration 033 adds the closing time and the wide banner. Until it is pasted
  // the form leaves both out rather than failing the whole insert.
  useEffect(() => {
    let alive = true;
    void db().from("events").select("ends_at, banner_path").limit(1).then(({ error }) => { if (alive) setExtraColumns(!error); });
    return () => { alive = false; };
  }, []);

  const shown = events.rows.filter((e) => matches(e.title + " " + (e.description ?? "") + " " + (e.location ?? "") + " " + (e.category ?? "") + " " + (names[e.owner_id] ?? ""), search));
  const paged = usePager(shown, 10);

  const counts = (eventId: string) => {
    const list = attendees.rows.filter((a) => a.event_id === eventId);
    return {
      going: list.filter((a) => a.response === "going").length,
      maybe: list.filter((a) => a.response === "maybe").length,
      declined: list.filter((a) => a.response === "declined").length,
    };
  };

  async function upload(file: File | null, folder: string, onDone: (path: string) => void) {
    if (!file) return;
    setUploading(true);
    const result = await uploadProMediaFile(db(), file, folder);
    setUploading(false);
    if ("error" in result) { toast.error(result.error); return; }
    onDone(result.path);
    toast.success(folder === "events" ? "Poster uploaded." : "Banner uploaded.");
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
          {extraColumns && (
            <Field label="Ends at"><input type="datetime-local" className="input" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></Field>
          )}
          <Field label="Location"><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Category"><input className="input" placeholder="Music, learning, sport…" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
        </div>
        <Field label="Description"><textarea className="input min-h-[5rem]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--bg-card)" }}>
            <Calendar className="w-4 h-4" />
            <span className="truncate">{uploading ? "Uploading…" : form.cover_path ? "Poster uploaded" : "Poster from your device"}</span>
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => { void upload(e.target.files?.[0] ?? null, "events", (path) => setForm((p) => ({ ...p, cover_path: path }))); e.target.value = ""; }} />
          </label>
          {extraColumns && (
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--bg-card)" }}>
              <ImageIcon className="w-4 h-4" />
              <span className="truncate">{uploading ? "Uploading…" : form.banner_path ? "Banner uploaded" : "Wide banner (optional)"}</span>
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => { void upload(e.target.files?.[0] ?? null, "banners", (path) => setForm((p) => ({ ...p, banner_path: path }))); e.target.value = ""; }} />
            </label>
          )}
          <Button loading={busy === "new"} icon={<Plus className="w-4 h-4" />} onClick={async () => {
            if (form.title.trim().length < 2) { toast.error("Give the event a title."); return; }
            if (!form.starts_at) { toast.error("Choose when it starts."); return; }
            const startsAt = new Date(form.starts_at).toISOString();
            const endsAt = form.ends_at ? new Date(form.ends_at).toISOString() : null;
            if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) { toast.error("The closing time must be after the start."); return; }
            setBusy("new");
            const values: Record<string, unknown> = {
              owner_id: adminId,
              title: form.title.trim(),
              description: form.description.trim() || null,
              starts_at: startsAt,
              location: form.location.trim() || null,
              category: form.category.trim() || null,
              cover_path: form.cover_path || null,
            };
            if (extraColumns) { values.ends_at = endsAt; values.banner_path = form.banner_path || null; }
            const { data, error } = await db().from("events").insert(values).select().single();
            setBusy(null);
            if (error || !data) { toast.error("Could not post it: " + (error?.message ?? "paste migration 031")); return; }
            events.set((p) => [data as EventRow, ...p]);
            void audit(adminId, { entityId: (data as EventRow).id, entityType: "event", action: "create_event", reason: form.title.trim() });
            setForm({ title: "", description: "", starts_at: "", ends_at: "", location: "", category: "", cover_path: "", banner_path: "" });
            toast.success("Event published to the hub.");
          }}>Publish event</Button>
        </div>
        {(form.cover_path || form.banner_path) && (
          <div className="flex flex-wrap gap-2">
            {[form.cover_path, form.banner_path].filter((p): p is string => !!p).map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p} src={mediaUrl(p)!} alt="" className="h-20 rounded-lg object-cover" style={{ backgroundColor: "var(--bg-card)" }} />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Events hub" hint="Unpublishing keeps the record and the RSVPs but hides it from members. The poster is the square card image; the banner is the wide strip at the top of the event page.">
        <span className="relative block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input className="input pl-9" placeholder="Search events…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </span>
        {events.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nothing scheduled.</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No event matches that search.</p>
        ) : (
          <div className="space-y-2">
            {paged.shown.map((e) => {
              const c = counts(e.id);
              const cover = mediaUrl(e.cover_path);
              const banner = mediaUrl(e.banner_path);
              return (
                <div key={e.id} className="p-3 rounded-xl space-y-2" style={{ backgroundColor: "var(--bg-main)" }}>
                  {banner && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={banner} alt="" className="w-full h-20 rounded-lg object-cover" />
                  )}
                  <div className="flex flex-wrap items-start gap-3">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <span className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--border)" }}>
                        <Calendar className="w-4 h-4 text-[var(--text-secondary)]" />
                      </span>
                    )}
                    <div className="flex-1 min-w-[12rem]">
                      <p className="font-semibold text-sm">{e.title}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {new Date(e.starts_at).toLocaleString()}
                        {e.ends_at ? ` → ${new Date(e.ends_at).toLocaleString()}` : ""}
                        {e.location ? ` · ${e.location}` : ""}{e.category ? ` · ${e.category}` : ""} · by @{names[e.owner_id] ?? "someone"}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--brand-gold-text)" }}>
                        {c.going} going · {c.maybe} maybe · {c.declined} declined
                      </p>
                    </div>
                    <Switch on={e.published} label={e.title} onChange={async (v) => {
                      setBusy(e.id);
                      const { data, error } = await db().from("events").update({ published: v }).eq("id", e.id).select("id");
                      setBusy(null);
                      if (error) { toast.error("Could not change that."); return; }
                      if (!data?.length) { toast.error("Nothing changed."); return; }
                      events.set((p) => p.map((x) => (x.id === e.id ? { ...x, published: v } : x)));
                      void audit(adminId, { entityId: e.id, entityType: "event", action: v ? "publish_event" : "unpublish_event" });
                    }} />
                    <Button size="sm" variant="ghost" onClick={() => setDraft({ ...e })}>Edit</Button>
                    <Button size="sm" variant="ghost" loading={busy === e.id} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      onClick={async () => {
                        if (await events.drop("id", e.id)) {
                          attendees.set((p) => p.filter((a) => a.event_id !== e.id));
                          void audit(adminId, { entityId: e.id, entityType: "event", action: "delete_event", reason: `${c.going} RSVPs removed with it` });
                          toast.success("Event deleted.");
                        }
                      }}>
                      Delete
                    </Button>
                  </div>
                  {draft?.id === e.id && (
                    <div className="grid sm:grid-cols-2 gap-2 pt-1">
                      <input className="input text-sm" value={draft.title} onChange={(ev) => setDraft({ ...draft, title: ev.target.value })} />
                      <input type="datetime-local" className="input text-sm" value={whenValue(draft.starts_at)} onChange={(ev) => setDraft({ ...draft, starts_at: ev.target.value ? new Date(ev.target.value).toISOString() : draft.starts_at })} />
                      {extraColumns && (
                        <input type="datetime-local" className="input text-sm" aria-label="Ends at" value={whenValue(draft.ends_at)}
                          onChange={(ev) => setDraft({ ...draft, ends_at: ev.target.value ? new Date(ev.target.value).toISOString() : null })} />
                      )}
                      <input className="input text-sm" placeholder="Location" value={draft.location || ""} onChange={(ev) => setDraft({ ...draft, location: ev.target.value || null })} />
                      <input className="input text-sm" placeholder="Category" value={draft.category || ""} onChange={(ev) => setDraft({ ...draft, category: ev.target.value || null })} />
                      <textarea className="input text-sm sm:col-span-2 min-h-[4rem]" placeholder="Description" value={draft.description || ""}
                        onChange={(ev) => setDraft({ ...draft, description: ev.target.value || null })} />
                      <label className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer"
                        style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--bg-card)" }}>
                        <Upload className="w-4 h-4" />
                        <span className="truncate">{uploading ? "Uploading…" : "Replace poster"}</span>
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(ev) => { void upload(ev.target.files?.[0] ?? null, "events", (path) => setDraft((d) => (d ? { ...d, cover_path: path } : d))); ev.target.value = ""; }} />
                      </label>
                      {extraColumns && (
                        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer"
                          style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--bg-card)" }}>
                          <ImageIcon className="w-4 h-4" />
                          <span className="truncate">{uploading ? "Uploading…" : "Replace banner"}</span>
                          <input type="file" accept="image/*" className="hidden"
                            onChange={(ev) => { void upload(ev.target.files?.[0] ?? null, "banners", (path) => setDraft((d) => (d ? { ...d, banner_path: path } : d))); ev.target.value = ""; }} />
                        </label>
                      )}
                      <div className="sm:col-span-2 flex gap-2">
                        <Button size="sm" icon={<Save className="w-3.5 h-3.5" />} loading={busy === draft.id} onClick={async () => {
                          if (draft.title.trim().length < 2) { toast.error("Give the event a title."); return; }
                          if (draft.ends_at && new Date(draft.ends_at).getTime() <= new Date(draft.starts_at).getTime()) {
                            toast.error("The closing time must be after the start."); return;
                          }
                          setBusy(draft.id);
                          const values: Record<string, unknown> = {
                            title: draft.title.trim(), starts_at: draft.starts_at, location: draft.location || null,
                            category: draft.category || null, description: draft.description || null,
                            cover_path: draft.cover_path,
                          };
                          if (extraColumns) { values.ends_at = draft.ends_at ?? null; values.banner_path = draft.banner_path ?? null; }
                          const { data, error } = await db().from("events").update(values).eq("id", draft.id).select().single();
                          setBusy(null);
                          if (error || !data) { toast.error("Nothing was saved: " + (error?.message ?? "no row came back")); return; }
                          events.set((p) => p.map((x) => (x.id === draft.id ? (data as EventRow) : x)));
                          void audit(adminId, { entityId: draft.id, entityType: "event", action: "edit_event" });
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
            <Pager page={paged.page} pages={paged.pages} total={paged.total} goTo={paged.goTo} singular="event" />
          </div>
        )}
      </Panel>
    </div>
  );
}
