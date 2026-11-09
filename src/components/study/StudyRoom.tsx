"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BookOpen, ExternalLink, Globe, GraduationCap, Library, LogOut,
  Maximize2, Minimize2, Plus, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SiteIconGrid } from "@/components/ui/SiteIconGrid";
import { createClient } from "@/lib/supabase/client";
import type { SiteShortcut, StudyBook } from "@/lib/supabase/types";
import toast from "react-hot-toast";

interface StudyCard {
  id: string;
  title: string;
  url: string;
  cover_url: string | null;
  description: string | null;
  created_at: string;
  added_by: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
}

interface Marker {
  book_id: string;
  position: number;
  percent: number;
  updated_at: string;
}

const SHELVES: { key: StudyBook["category"]; label: string; hue: number }[] = [
  { key: "educational", label: "Educational", hue: 162 },
  { key: "story", label: "Story books", hue: 8 },
  { key: "inspirational", label: "Inspirational", hue: 44 },
  { key: "holy", label: "Holy books", hue: 268 },
];

const ROWS_PER_CASE = 4;
const SPINES_PER_ROW = 10;

// A stable little number from the title, used to vary spine width, colour and
// height so the wall never looks like the same book standing forty times.
function seedOf(text: string) {
  let n = 0;
  for (let i = 0; i < text.length; i++) n = (n * 31 + text.charCodeAt(i)) % 100000;
  return n;
}

const inputCls = "w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10";
const inputStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;

export function StudyRoom({ initial, currentUserId, sites, books, isFullscreen, onToggleFullscreen, onLeave }: {
  initial: StudyCard[];
  currentUserId: string;
  sites: SiteShortcut[];
  books: StudyBook[];
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onLeave: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [showSites, setShowSites] = useState(false);
  const [openShelf, setOpenShelf] = useState<StudyBook["category"] | "all" | null>(null);
  const [marks, setMarks] = useState<Record<string, Marker>>({});
  const [form, setForm] = useState({ title: "", url: "", cover_url: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [offset, setOffset] = useState(0);
  const [maxOffset, setMaxOffset] = useState(0);
  const [gliding, setGliding] = useState(false);
  const [peek, setPeek] = useState<StudyBook | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; offset: number } | null>(null);
  const movedRef = useRef(false);

  // The wall is only as walkable as it is wide, so the travel limit is measured
  // rather than guessed — it changes with the screen and with full screen.
  useEffect(() => {
    const stage = stageRef.current;
    const track = trackRef.current;
    if (!stage || !track) return;
    const measure = () => setMaxOffset(Math.max(0, track.scrollWidth - stage.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(track);
    return () => observer.disconnect();
  }, [books]);

  useEffect(() => {
    createClient()
      .from("study_progress")
      .select("book_id, position, percent, updated_at")
      .eq("user_id", currentUserId)
      .order("updated_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        const map: Record<string, Marker> = {};
        for (const row of (data || []) as Marker[]) map[row.book_id] = row;
        setMarks(map);
      });
  }, [currentUserId]);

  const byShelf = useMemo(() => {
    const groups = new Map<StudyBook["category"], StudyBook[]>();
    for (const shelf of SHELVES) groups.set(shelf.key, []);
    for (const b of books) groups.get(b.category)?.push(b);
    for (const shelf of SHELVES) {
      const list = groups.get(shelf.key) || [];
      list.sort((a, b) => (a.cover_url ? 0 : 1) - (b.cover_url ? 0 : 1) || a.title.localeCompare(b.title));
    }
    return groups;
  }, [books]);

  const recent = useMemo(
    () => Object.values(marks).filter((m) => m.percent > 0 && m.percent < 99)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((m) => ({ mark: m, book: books.find((b) => b.id === m.book_id) }))
      .filter((x) => x.book)
      .slice(0, 3),
    [marks, books]
  );

  const clamp = useCallback((next: number) => Math.max(0, Math.min(maxOffset, next)), [maxOffset]);

  const grab = useCallback((e: ReactPointerEvent) => {
    dragRef.current = { x: e.clientX, offset };
    movedRef.current = false;
    setGliding(true);
  }, [offset]);

  useEffect(() => {
    if (!gliding) return;
    const move = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 4) movedRef.current = true;
      setOffset(clamp(drag.offset - dx));
      // Whatever the fingertip passes over is the book being looked at, so the
      // shelf card follows the walk instead of waiting for a tap.
      const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const id = hit?.closest<HTMLElement>("[data-book-id]")?.dataset.bookId;
      if (id) setPeek((p) => (p?.id === id ? p : books.find((b) => b.id === id) || p));
    };
    const up = () => { setGliding(false); dragRef.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [gliding, clamp, books]);

  // Walking the room from the keyboard, for anyone not using a finger.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { setOffset((o) => clamp(o + 160)); e.preventDefault(); }
      if (e.key === "ArrowLeft") { setOffset((o) => clamp(o - 160)); e.preventDefault(); }
      if (e.key === "Escape") setShowForm(false);
    };
    stage.addEventListener("keydown", onKey);
    return () => stage.removeEventListener("keydown", onKey);
  }, [clamp]);

  const openBook = useCallback((b: StudyBook) => {
    if (movedRef.current) return; // a walk that started on a spine is still a walk
    router.push(`/study/${b.id}`);
  }, [router]);

  async function add() {
    if (!form.title.trim() || !/^https?:\/\//.test(form.url.trim())) {
      toast.error("A title and a valid http(s) link are required.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.from("study_resources").insert({
      title: form.title.trim(),
      url: form.url.trim(),
      cover_url: form.cover_url.trim() || null,
      description: form.description.trim() || null,
      added_by: currentUserId,
    }).select().single();
    setSaving(false);
    if (error || !data) { toast.error("Could not add resource: " + (error?.message || "")); return; }
    setItems((p) => [{ ...data, added_by: null } as unknown as StudyCard, ...p]);
    setForm({ title: "", url: "", cover_url: "", description: "" });
    toast.success("Added to the Study Room!");
  }

  async function remove(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("study_resources").delete().eq("id", id);
    if (error) { toast.error("Delete failed."); return; }
    setItems((p) => p.filter((x) => x.id !== id));
    toast.success("Resource removed.");
  }

  const drawerBooks = openShelf === "all" ? books : openShelf ? byShelf.get(openShelf) || [] : [];
  const peekMark = peek ? marks[peek.id] : undefined;
  const peekShelf = peek ? SHELVES.find((s) => s.key === peek.category) : undefined;

  return (
    <section className={isFullscreen ? "space-y-4 room-only" : "space-y-4"}>
      {/* .room-side is what full screen folds away — see globals.css */}
      <div className="room-side">
      <div className="flex items-center gap-2">
        <GraduationCap className="w-6 h-6" style={{ color: "rgb(var(--a-800))" }} />
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Study Room</h2>
        <button
          onClick={() => setShowSites((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors"
          style={showSites
            ? { backgroundColor: "rgb(var(--a-800))", borderColor: "rgb(var(--a-800))", color: "#fff" }
            : { backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          <Globe className="w-4 h-4" /> Visit sites
        </button>
      </div>

      {showSites && (
        sites.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No study sites yet — an admin can add them under Admin → Sites.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Learning sites</p>
            <SiteIconGrid items={sites} />
          </div>
        )
      )}

      {recent.length > 0 && (
        <div className="card p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Pick up where you stopped</p>
          {recent.map(({ mark, book }) => (
            <Link key={book!.id} href={`/study/${book!.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:opacity-90"
              style={{ backgroundColor: "var(--bg)" }}>
              <span className="w-9 h-12 rounded-sm flex-none overflow-hidden"
                style={book!.cover_url
                  ? { backgroundImage: `url(${book!.cover_url})`, backgroundSize: "cover", backgroundPosition: "top center" }
                  : { background: "linear-gradient(160deg, rgb(var(--a-700)), rgb(var(--b-600)))" }} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{book!.title}</span>
                <span className="mt-1 block h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                  <span className="block h-full rounded-full" style={{ width: `${mark.percent}%`, background: "rgb(var(--b-400))" }} />
                </span>
              </span>
              <span className="text-xs font-bold flex-none" style={{ color: "var(--text-secondary)" }}>{mark.percent}%</span>
              <ArrowRight className="w-4 h-4 flex-none" style={{ color: "rgb(var(--a-800))" }} />
            </Link>
          ))}
        </div>
      )}
      </div>

      {/* The library itself: one long wall of cases that the reader walks past. */}
      <div
        ref={stageRef}
        className={"library" + (gliding ? " library--gliding" : "") + (isFullscreen ? " library--full" : "")}
        style={{ "--shift": `${offset}px`, "--wall": `${Math.round(offset * 0.35)}px` } as CSSProperties}
        onPointerDown={grab}
        tabIndex={0}
        role="application"
        aria-label="Study Room library. Slide left or right along the shelves. Sliding over a book shows what it is; tapping it opens it to read."
      >
        <div className="library__wall" aria-hidden="true" />
        <div className="library__light" aria-hidden="true" />

        <div ref={trackRef} className="library__track">
          {SHELVES.map((shelf) => {
            const stock = byShelf.get(shelf.key) || [];
            const onWall = stock.slice(0, ROWS_PER_CASE * SPINES_PER_ROW);
            const rows: StudyBook[][] = [];
            for (let i = 0; i < onWall.length; i += SPINES_PER_ROW) rows.push(onWall.slice(i, i + SPINES_PER_ROW));
            return (
              <section key={shelf.key} className="library__case" aria-label={`${shelf.label} case`}>
                <div className="library__crown" />
                <div className="library__tiers">
                  {rows.map((row, r) => (
                    <div key={r} className="library__row">
                      <div className="library__spines">
                        {row.map((b, i) => {
                          const seed = seedOf(b.title);
                          const faceOut = r === 0 && i < 2 && !!b.cover_url;
                          const mark = marks[b.id];
                          return (
                            <button
                              key={b.id}
                              type="button"
                              data-book-id={b.id}
                              className={"library__book" + (faceOut ? " library__book--face" : "") + (peek?.id === b.id ? " library__book--lit" : "")}
                              style={{
                                height: `${faceOut ? 92 : 74 + (seed % 22)}%`,
                                flex: `${faceOut ? 2.2 : 0.85 + (seed % 60) / 100} 0 0`,
                                "--h": (shelf.hue + (seed % 44) - 22 + 360) % 360,
                              } as CSSProperties}
                              aria-label={`${b.title}${b.author ? " by " + b.author : ""}`}
                              onPointerEnter={() => setPeek(b)}
                              onClick={() => openBook(b)}
                            >
                              {faceOut ? (
                                <span className="library__face" style={{ backgroundImage: `url(${b.cover_url})` }} />
                              ) : (
                                <span className="library__spine">{b.title.length > 26 ? `${b.title.slice(0, 25)}…` : b.title}</span>
                              )}
                              {mark && mark.percent > 0 && <span className="library__ribbon" />}
                            </button>
                          );
                        })}
                      </div>
                      <div className="library__plank" />
                    </div>
                  ))}
                  {rows.length === 0 && (
                    <p className="library__empty">This case is waiting for books.</p>
                  )}
                </div>
                <button type="button" className="library__plate" onClick={() => setOpenShelf(shelf.key)}>
                  {shelf.label}
                  <span className="opacity-70">{stock.length}</span>
                </button>
              </section>
            );
          })}
        </div>

        {/* The shelf card: what you are standing in front of right now. */}
        {peek && (
          <div className="library__card" role="status">
            <span
              className={"library__card-cover" + (peek.cover_url ? "" : " library__card-cover--spine")}
              style={{
                backgroundImage: peek.cover_url ? `url(${peek.cover_url})` : undefined,
                "--h": ((peekShelf ? peekShelf.hue : 160) + (seedOf(peek.title) % 44) - 22 + 360) % 360,
              } as CSSProperties}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.16em] font-bold" style={{ color: "rgb(var(--b-300))" }}>
                {peekShelf ? peekShelf.label : "Shelf"}
              </p>
              <p className="text-sm font-extrabold leading-tight truncate">{peek.title}</p>
              <p className="text-[11px] opacity-75 mt-0.5">{peek.author || "Project Gutenberg"}</p>
              <p className="text-xs opacity-90 mt-1.5 line-clamp-3">
                {peek.description
                  || (peekMark && peekMark.percent > 0
                    ? `You stopped ${peekMark.percent}% through this one.`
                    : "Open it and CONNEXA keeps your place, so the next visit starts on this page.")}
              </p>
              {peek.description && (
                <p className="text-[10px] opacity-55 mt-1">Details from Wikipedia or the book&rsquo;s own title page</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 flex-none">
              <Button size="sm" icon={<ArrowRight className="w-4 h-4" />} onClick={() => router.push(`/study/${peek.id}`)}>
                {peekMark && peekMark.percent > 0 ? `Read at ${peekMark.percent}%` : "Read"}
              </Button>
              <a
                href={peek.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold opacity-70 hover:opacity-100"
              >
                <ExternalLink className="w-3 h-3" /> Gutenberg
              </a>
            </div>
          </div>
        )}

        <div className="library__hint">
          <Library className="w-3.5 h-3.5" />
          <span>{maxOffset > 0 ? "Slide along the wall" : "The whole wall fits this screen"}</span>
        </div>

        {/* Floating over the room, so leaving is one tap, not an escape key. */}
        <div className="library__controls">
          <button
            type="button"
            className="library__control"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? "Leave full screen" : "Enter full screen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span>{isFullscreen ? "Small screen" : "Full screen"}</span>
          </button>
          <button type="button" className="library__control" onClick={onLeave} aria-label="Leave the study room">
            <LogOut className="w-4 h-4" />
            <span>Exit room</span>
          </button>
        </div>

        <div className="library__walk" aria-hidden="true">
          <button type="button" onClick={() => setOffset((o) => clamp(o - 240))} disabled={offset <= 0} aria-label="Walk to the left">‹</button>
          <span className="library__walk-track">
            <span className="library__walk-dot" style={{ left: `${maxOffset ? (offset / maxOffset) * 100 : 0}%` }} />
          </span>
          <button type="button" onClick={() => setOffset((o) => clamp(o + 240))} disabled={offset >= maxOffset} aria-label="Walk to the right">›</button>
        </div>
      </div>

      <div className="room-side flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
        <span>Slide along the shelves — stop on a book and its details rise.</span>
        <button onClick={() => setOpenShelf("all")} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
          style={{ color: "rgb(var(--a-800))" }}>
          <Library className="w-3.5 h-3.5" /> Browse all {books.length} books
        </button>
        <span className="ml-auto inline-flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5" /> Reading here saves your place
        </span>
      </div>

      {openShelf && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>
              {openShelf === "all" ? "Every shelf" : SHELVES.find((s) => s.key === openShelf)?.label}
            </h3>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{drawerBooks.length.toLocaleString()} of {books.length} titles</span>
            <button onClick={() => setOpenShelf(null)} className="ml-auto text-xs font-semibold" style={{ color: "rgb(var(--a-800))" }}>
              Close shelf
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {drawerBooks.map((b) => {
              const mark = marks[b.id];
              return (
                <div key={b.id} className="rounded-2xl border overflow-hidden transition-transform hover:scale-[1.02] relative"
                  style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                  <Link href={`/study/${b.id}`} className="block">
                    {b.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.cover_url}
                        alt={`Cover of ${b.title}`}
                        className="w-full h-32 object-cover object-top"
                        style={{ backgroundColor: "var(--border)" }}
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <div className="h-32 flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg,rgb(var(--a-800)),rgb(var(--b-500)))" }}>
                        <Library className="w-8 h-8 text-white/80" />
                      </div>
                    )}
                    <div className="p-3">
                      <p className="text-sm font-bold leading-tight line-clamp-2" style={{ color: "var(--text-primary)" }}>{b.title}</p>
                      {b.author && <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>{b.author}</p>}
                      {mark && mark.percent > 0 ? (
                        <p className="text-[11px] mt-1.5 font-semibold" style={{ color: "rgb(var(--b-600))" }}>
                          {mark.percent >= 99 ? "Finished" : `Resume at ${mark.percent}%`}
                        </p>
                      ) : (
                        <p className="text-[11px] mt-1.5 font-semibold uppercase tracking-wide" style={{ color: "rgb(var(--a-800))" }}>
                          Read in CONNEXA
                        </p>
                      )}
                    </div>
                  </Link>
                  <a href={b.pdf_url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${b.title} on Project Gutenberg`}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add form */}
      <div className="room-side card p-4 space-y-3">
        <button
          type="button"
          className="w-full flex items-center gap-1.5 text-sm font-semibold text-left"
          style={{ color: "var(--text-primary)" }}
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="w-4 h-4" style={{ color: "rgb(var(--a-800))" }} /> Add a resource
        </button>
        {showForm && (
          <div className="grid sm:grid-cols-2 gap-2">
            <input className={inputCls} style={inputStyle} placeholder="Title (e.g. WAEC past questions)"
              value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <input className={inputCls} style={inputStyle} placeholder="https://link-to-the-resource"
              value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
            <input className={inputCls} style={inputStyle} placeholder="Thumbnail image URL (optional)"
              value={form.cover_url} onChange={(e) => setForm((f) => ({ ...f, cover_url: e.target.value }))} />
            <input className={inputCls} style={inputStyle} placeholder="Short description (optional)"
              value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        )}
        {showForm && (
          <div className="flex justify-end">
            <Button size="sm" onClick={add} disabled={saving} icon={<Plus className="w-3.5 h-3.5" />}>
              {saving ? "Adding…" : "Add to Study Room"}
            </Button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="room-side card p-8 text-center">
          <Library className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-secondary)" }} />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No study links yet — be the first to add one.</p>
        </div>
      ) : (
        <div className="room-side grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((g) => (
            <div key={g.id} className="rounded-2xl border overflow-hidden transition-transform hover:scale-[1.02] relative"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
              <a href={g.url} target="_blank" rel="noopener noreferrer" className="block">
                {g.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.cover_url} alt={g.title} className="w-full h-28 object-cover" />
                ) : (
                  <div className="w-full h-28 flex items-center justify-center" style={{ backgroundColor: "var(--border)" }}>
                    <GraduationCap className="w-8 h-8" style={{ color: "var(--text-secondary)" }} />
                  </div>
                )}
                <div className="p-3">
                  <p className="font-bold text-sm flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                    <span className="flex-1 truncate">{g.title}</span>
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-secondary)" }} />
                  </p>
                  {g.description && (
                    <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{g.description}</p>
                  )}
                  <p className="text-[11px] mt-1.5" style={{ color: "var(--text-secondary)" }}>
                    {g.added_by ? `added by ${g.added_by.display_name}` : "Study Room pick"}
                  </p>
                </div>
              </a>
              {(g.added_by?.id === currentUserId) && (
                <button onClick={() => remove(g.id)} aria-label="Remove resource"
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="room-side text-sm -mt-2" style={{ color: "var(--text-secondary)" }}>
        Shared learning links. Drop a link, add a thumbnail to represent it, and everyone in CONNEXA can open it.
      </p>
    </section>
  );
}
