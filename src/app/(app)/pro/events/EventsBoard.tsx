"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Image as ImageIcon, MapPin, Plus, Upload, UserPlus, X } from "lucide-react";
import toast from "react-hot-toast";
import { createEvent, rsvpEvent, uploadProMedia } from "@/lib/actions/pro";
import { LockedFeaturePreview } from "@/components/pro/LockedFeaturePreview";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { ReportButton } from "@/components/pro/ReportButton";
import { EventInvites } from "./EventInvites";
import { EventGuestList } from "./EventGuestList";
import { EventDetailsEditor } from "./EventDetailsEditor";
import { EXTRAS_NOTICE, saveNewEventExtras } from "./eventExtras";

export type EventCardRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  category: string | null;
  owner_id: string;
  cover_url: string | null;
  banner_path: string | null;
  banner_url: string | null;
  owner: { id: string; username: string; display_name: string } | null;
  attendees: { user_id: string; response: "going" | "maybe" | "declined" }[];
};

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventsBoard({
  events,
  currentUserId,
  canCreate,
  pro,
  extrasReady,
}: {
  events: EventCardRow[];
  currentUserId: string;
  canCreate: boolean;
  pro: boolean;
  extrasReady: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [cover, setCover] = useState<{ path: string; url: string } | null>(null);
  const [banner, setBanner] = useState<{ path: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [now] = useState(() => Date.now());

  async function pickCover(file: File | null) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("folder", "events");
    const res = await uploadProMedia(fd);
    setUploading(false);
    if ("error" in res) { toast.error(res.error); return; }
    setCover({ path: res.path, url: res.url });
  }

  async function pickBanner(file: File | null) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("folder", "events");
    const res = await uploadProMedia(fd);
    setUploading(false);
    if ("error" in res) { toast.error(res.error); return; }
    setBanner({ path: res.path, url: res.url });
  }

  function publish() {
    const starts = new Date(startsAt);
    if (Number.isNaN(starts.getTime())) { toast.error("Pick a date and time that makes sense."); return; }
    const ends = endsAt ? new Date(endsAt) : null;
    if (ends && Number.isNaN(ends.getTime())) { toast.error("Pick an end time that makes sense."); return; }
    start(async () => {
      const startsIso = starts.toISOString();
      const res = await createEvent({ title, description, startsAt: startsIso, location, category, coverPath: cover?.path });
      if ("error" in res) { toast.error(res.error); return; }
      // The 033 columns are a second write, so a database without them still
      // gets the event.
      if (ends || banner) {
        const problem = await saveNewEventExtras(
          currentUserId, title.trim().slice(0, 160), startsIso,
          ends ? ends.toISOString() : null, banner?.path ?? null
        );
        if (problem) toast.error(problem);
      }
      setComposing(false);
      setTitle(""); setDescription(""); setLocation(""); setCategory(""); setCover(null);
      setEndsAt(""); setBanner(null);
      toast.success(res.message ?? "Event published.");
      router.refresh();
    });
  }

  function rsvp(id: string, response: "going" | "maybe" | "declined") {
    start(async () => {
      const res = await rsvpEvent(id, response);
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  const upcoming = events.filter((e) => new Date(e.starts_at).getTime() >= now);
  const past = events.filter((e) => new Date(e.starts_at).getTime() < now).reverse();
  // A non-PRO visitor gets a short, real glimpse of what is coming up.
  const shownUpcoming = pro ? upcoming : upcoming.slice(0, 3);

  return (
    <div className="space-y-4">
      {!pro && (
        <LockedFeaturePreview blurb="The next events are shown here; hosting your own and the full archive are PRO features." />
      )}

      <EventInvites pro={pro} />

      {canCreate && (
        composing ? (
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>New event</h2>
              <button type="button" onClick={() => setComposing(false)} className="p-1.5 rounded-lg border"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {!extrasReady && <ProDataNote tone="warn">{EXTRAS_NOTICE}</ProDataNote>}
            <input className="input" maxLength={160} placeholder="Event name" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="input min-h-[80px]" maxLength={2000} placeholder="What is it?"
              value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                Starts
                <input type="datetime-local" className="input mt-1" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </label>
              <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                Ends (optional)
                <input type="datetime-local" className="input mt-1" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </label>
              <input className="input" maxLength={200} placeholder="Where" value={location} onChange={(e) => setLocation(e.target.value)} />
              <input className="input" maxLength={60} placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
              <label className="btn-ghost text-sm justify-center inline-flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4" />{uploading ? "Uploading…" : cover ? "Change poster" : "Add poster"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void pickCover(e.target.files?.[0] ?? null)} />
              </label>
              <label className="btn-ghost text-sm justify-center inline-flex items-center gap-2 cursor-pointer">
                <ImageIcon className="w-4 h-4" />{uploading ? "Uploading…" : banner ? "Change banner" : "Add banner"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void pickBanner(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.url} alt="" className="h-28 rounded-xl object-cover" />
            )}
            {banner && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner.url} alt="" className="w-full h-28 rounded-xl object-cover" />
            )}
            <button type="button" className="btn-primary text-sm" disabled={pending || uploading} onClick={publish}>Publish event</button>
          </div>
        ) : (
          <button type="button" className="btn-primary text-sm" onClick={() => setComposing(true)}>
            <Plus className="w-4 h-4" /> Host an event
          </button>
        )
      )}

      {events.length === 0 && (
        <div className="card p-8 text-center space-y-2">
          <CalendarDays className="w-8 h-8 mx-auto" style={{ color: "var(--text-secondary)" }} />
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Nothing scheduled</p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {canCreate ? "Be the first to put something on the hub." : "PRO members can publish events here."}
          </p>
        </div>
      )}

      {shownUpcoming.map((e) => <EventCard key={e.id} e={e} currentUserId={currentUserId} pending={pending} onRsvp={rsvp} />)}

      {pro && past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Past</h2>
          {past.map((e) => <EventCard key={e.id} e={e} currentUserId={currentUserId} pending={pending} onRsvp={rsvp} />)}
        </section>
      )}
    </div>
  );
}

function EventCard({
  e,
  currentUserId,
  pending,
  onRsvp,
}: {
  e: EventCardRow;
  currentUserId: string;
  pending: boolean;
  onRsvp: (id: string, response: "going" | "maybe" | "declined") => void;
}) {
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(false);
  const going = e.attendees.filter((a) => a.response === "going").length;
  const mine = e.attendees.find((a) => a.user_id === currentUserId)?.response;
  const host = e.owner_id === currentUserId;
  const hero = e.banner_url ?? e.cover_url;

  return (
    <article id={`event-${e.id}`} className="card overflow-hidden scroll-mt-24">
      {hero ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hero} alt="" className="w-full h-40 object-cover" />
      ) : (
        <div className="w-full h-24 flex items-center justify-center" style={{ background: "var(--brand-green)" }}>
          <ImageIcon className="w-6 h-6" style={{ color: "var(--brand-gold)" }} />
        </div>
      )}
      <div className="p-4 space-y-2">
        <p className="font-bold text-lg leading-tight" style={{ color: "var(--text-primary)" }}>{e.title}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="w-4 h-4" />
            {new Date(e.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            {e.ends_at && <> until {new Date(e.ends_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</>}
          </span>
          {e.location && <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" />{e.location}</span>}
          {e.category && <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: "var(--border)" }}>{e.category}</span>}
        </div>
        {e.description && <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>{e.description}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(["going", "maybe", "declined"] as const).map((r) => (
            <button key={r} type="button" disabled={pending} onClick={() => onRsvp(e.id, r)}
              className="px-3 py-1.5 rounded-full text-xs font-bold border capitalize"
              style={mine === r
                ? { borderColor: "var(--brand-gold)", background: "var(--brand-gold)", color: "var(--brand-green)" }
                : { borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              {r}
            </button>
          ))}
          <span className="text-xs ml-auto" style={{ color: "var(--text-secondary)" }}>
            {going} {going === 1 ? "person is" : "people are"} going
            {e.owner && <> · hosted by <Link href={`/profile/${e.owner.username}`} className="font-semibold hover:underline" style={{ color: "rgb(var(--a-800))" }}>{e.owner.display_name}</Link></>}
          </span>
        </div>

        {host && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="btn-ghost text-sm border" style={{ borderColor: "var(--border)" }}
              aria-expanded={inviting}
              onClick={() => { setInviting((v) => !v); setEditing(false); }}>
              <UserPlus className="w-4 h-4" /> Invite people
            </button>
            <button type="button" className="btn-ghost text-sm border" style={{ borderColor: "var(--border)" }}
              aria-expanded={editing}
              onClick={() => { setEditing((v) => !v); setInviting(false); }}>
              <ImageIcon className="w-4 h-4" /> End time &amp; banner
            </button>
          </div>
        )}

        {host && inviting && <EventGuestList eventId={e.id} currentUserId={currentUserId} />}
        {host && editing && (
          <EventDetailsEditor
            eventId={e.id}
            initialEndsAt={e.ends_at ? toLocalInput(new Date(e.ends_at)) : ""}
            initialBanner={e.banner_path && e.banner_url ? { path: e.banner_path, url: e.banner_url } : null}
            onClose={() => setEditing(false)}
          />
        )}

        <ReportButton entityType="event" entityId={e.id} />
      </div>
    </article>
  );
}
