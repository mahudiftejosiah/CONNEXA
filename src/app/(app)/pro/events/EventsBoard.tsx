"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Image as ImageIcon, MapPin, Plus, Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import { createEvent, rsvpEvent, uploadProMedia } from "@/lib/actions/pro";

export type EventCardRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  location: string | null;
  category: string | null;
  owner_id: string;
  cover_url: string | null;
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
}: {
  events: EventCardRow[];
  currentUserId: string;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [cover, setCover] = useState<{ path: string; url: string } | null>(null);
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

  function publish() {
    start(async () => {
      const res = await createEvent({ title, description, startsAt: new Date(startsAt).toISOString(), location, category, coverPath: cover?.path });
      if ("error" in res) { toast.error(res.error); return; }
      setComposing(false);
      setTitle(""); setDescription(""); setLocation(""); setCategory(""); setCover(null);
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

  return (
    <div className="space-y-4">
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
            <input className="input" maxLength={160} placeholder="Event name" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="input min-h-[80px]" maxLength={2000} placeholder="What is it?"
              value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="grid sm:grid-cols-2 gap-2">
              <input type="datetime-local" className="input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              <input className="input" maxLength={200} placeholder="Where" value={location} onChange={(e) => setLocation(e.target.value)} />
              <input className="input" maxLength={60} placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
              <label className="btn-ghost text-sm justify-center inline-flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4" />{uploading ? "Uploading…" : cover ? "Change poster" : "Add poster"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void pickCover(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.url} alt="" className="h-28 rounded-xl object-cover" />
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

      {upcoming.map((e) => <EventCard key={e.id} e={e} currentUserId={currentUserId} pending={pending} onRsvp={rsvp} />)}

      {past.length > 0 && (
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
  const going = e.attendees.filter((a) => a.response === "going").length;
  const mine = e.attendees.find((a) => a.user_id === currentUserId)?.response;

  return (
    <article className="card overflow-hidden">
      {e.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.cover_url} alt="" className="w-full h-40 object-cover" />
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
      </div>
    </article>
  );
}
