"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BookOpen, ExternalLink, Globe, GraduationCap, Library, LogOut,
  Maximize2, Minimize2, Plus, Trash2, X,
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

const SPINES_PER_SHELF = 12;
const DESIGN_WIDTH = 720;

// A stable little number from the title, used to vary spine colour and height so
// no two books on a shelf look identical.
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
  const [openBook, setOpenBook] = useState<StudyBook | null>(null);

  const [scale, setScale] = useState(0.55);
  const [view, setView] = useState({ turn: 0, tilt: 0 });
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; turn: number; tilt: number } | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1.2, Math.max(0.5, el.clientWidth / DESIGN_WIDTH)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Empty on a database that has not had migration 018 yet — the room simply
  // shows no bookmarks then.
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

  const startDrag = useCallback((e: ReactPointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, turn: view.turn, tilt: view.tilt };
    movedRef.current = false;
    setDragging(true);
  }, [view]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) < Math.abs(dy)) return; // the page is scrolling, not the room
      if (Math.abs(dx) > 4) movedRef.current = true;
      setView({
        turn: Math.max(-22, Math.min(22, drag.turn + dx * 0.14)),
        tilt: Math.max(-9, Math.min(11, drag.tilt - dy * 0.05)),
      });
    };
    const up = () => {
      setDragging(false);
      dragRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging]);

  // A drag that travelled is not a tap on the book underneath it.
  const tapped = useCallback((run: () => void) => {
    if (movedRef.current) return;
    run();
  }, []);

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

  return (
    <section className="space-y-4">
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

      {/* The room itself */}
      <div
        ref={frameRef}
        className={"room3d" + (dragging ? " room3d--dragging" : "")}
        style={{ "--s": scale, "--turn": `${view.turn}deg`, "--tilt": `${view.tilt}deg` } as CSSProperties}
        onPointerDown={startDrag}
        aria-label="Study Room. Drag left or right to look around the shelves."
      >
        <div className="room3d__enter">
          <div className="room3d__look">
            <div className="room3d__sway">
              <div className="room3d__wall room3d__wall--back">
                <div className="room3d__picture" />
                <div className="room3d__clock" />
              </div>
              <div className="room3d__wall room3d__wall--left"><div className="room3d__window" /></div>
              <div className="room3d__wall room3d__wall--right" />
              <div className="room3d__ceiling" />
              <div className="room3d__floor">
                <div className="room3d__rug" />
                <div className="room3d__beam" />
              </div>

              <div className="room3d__lamp">
                <div className="room3d__shade" />
                <div className="room3d__bulb" />
              </div>

              <div className="room3d__case">
                <div className="room3d__cornice" />
                {SHELVES.map((shelf) => {
                  const stock = byShelf.get(shelf.key) || [];
                  const faceOuts = scale > 0.72 ? 2 : 1;
                  const visible = stock.slice(0, SPINES_PER_SHELF);
                  return (
                    <div key={shelf.key} className="room3d__shelf">
                      <div className="room3d__books">
                        {visible.map((b, i) => {
                          const seed = seedOf(b.title);
                          const face = i < faceOuts && !!b.cover_url;
                          const mark = marks[b.id];
                          return (
                            <button
                              key={b.id}
                              type="button"
                              className={"room3d__book" + (face ? " room3d__book--face" : "")}
                              style={{ height: `${face ? 100 : 82 + (seed % 18)}%` }}
                              title={b.title}
                              onClick={() => tapped(() => setOpenBook(b))}
                            >
                              {face ? (
                                <span className="room3d__face" style={{ backgroundImage: `url(${b.cover_url})` }} />
                              ) : (
                                <span className="room3d__spine" style={{ "--h": (shelf.hue + (seed % 44) - 22 + 360) % 360 } as CSSProperties}>
                                  {b.title.length > 30 ? `${b.title.slice(0, 29)}…` : b.title}
                                </span>
                              )}
                              {mark && mark.percent > 0 && <span className="room3d__mark" />}
                            </button>
                          );
                        })}
                        {visible.length === 0 && (
                          <span className="text-[11px] opacity-60" style={{ color: "#e8dcc0" }}>This shelf is waiting for books.</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="room3d__plate"
                        onClick={() => tapped(() => setOpenShelf(shelf.key))}
                      >
                        {shelf.label}
                        <span className="opacity-70">{stock.length}</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="room3d__plant" />
              <div className="room3d__desk">
                <div className="room3d__desk-top" />
                <div className="room3d__stack" />
                <div className="room3d__open-book" />
              </div>

              <div className="room3d__dust" style={{ left: "22%", bottom: "26%", animationDelay: "0s" }} />
              <div className="room3d__dust" style={{ left: "58%", bottom: "18%", animationDelay: "3s" }} />
              <div className="room3d__dust" style={{ left: "76%", bottom: "34%", animationDelay: "6s" }} />
            </div>
          </div>
        </div>
        <div className="room3d__glare" />

        {/* Floating controls — leaving the room is one tap, not an escape key. */}
        <div className="room3d__exit">
          <button
            type="button"
            className="room3d__exit-btn"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? "Leave full screen" : "Enter full screen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span>{isFullscreen ? "Small screen" : "Full screen"}</span>
          </button>
          <button type="button" className="room3d__exit-btn" onClick={onLeave} aria-label="Leave the study room">
            <LogOut className="w-4 h-4" />
            <span>Exit room</span>
          </button>
        </div>

        {openBook && (() => {
          const mark = marks[openBook.id];
          const shelf = SHELVES.find((s) => s.key === openBook.category);
          const seed = seedOf(openBook.title);
          return (
            <div className="room-welcome" role="dialog" aria-modal="true" aria-label={`Welcome to ${openBook.title}`}>
              <div className="room-welcome__card">
                <span className="room-welcome__glow" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setOpenBook(null)}
                  aria-label="Close"
                  className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgb(255 255 255 / 0.08)", color: "#f2e8d5" }}
                >
                  <X className="w-4 h-4" />
                </button>
                <span
                  className={"room-welcome__cover" + (openBook.cover_url ? "" : " room-welcome__cover--spine")}
                  style={{
                    backgroundImage: openBook.cover_url ? `url(${openBook.cover_url})` : undefined,
                    "--h": ((shelf ? shelf.hue : 160) + (seed % 44) - 22 + 360) % 360,
                  } as CSSProperties}
                  aria-hidden="true"
                />
                <p className="room-welcome__eyebrow text-[11px] uppercase tracking-[0.18em] font-bold" style={{ color: "rgb(var(--b-300))" }}>
                  Welcome to the {shelf ? shelf.label.toLowerCase() : "study"} shelf
                </p>
                <h3 className="room-welcome__title text-xl sm:text-2xl font-extrabold mt-1 leading-tight">{openBook.title}</h3>
                <p className="room-welcome__by text-sm mt-1 opacity-75">
                  {openBook.author || "Project Gutenberg"} · free to read here
                </p>
                <p className="room-welcome__blurb text-sm mt-3 opacity-85">
                  {mark && mark.percent > 0
                    ? `You stopped ${mark.percent}% through. Pick up exactly where the page left off.`
                    : "Open it and CONNEXA keeps your place, so the next visit starts on this page."}
                </p>
                <div className="room-welcome__actions flex flex-wrap gap-2 mt-5">
                  <Button
                    size="sm"
                    icon={<ArrowRight className="w-4 h-4" />}
                    onClick={() => router.push(`/study/${openBook.id}`)}
                  >
                    {mark && mark.percent > 0 ? `Continue at ${mark.percent}%` : "Start reading"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setOpenBook(null)}>
                    Back to the shelves
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
        <span>Drag the room to look around.</span>
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
      <div className="card p-4 space-y-3">
        <p className="font-semibold text-sm flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
          <Plus className="w-4 h-4" style={{ color: "rgb(var(--a-800))" }} /> Add a resource
        </p>
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
        <div className="flex justify-end">
          <Button size="sm" onClick={add} disabled={saving} icon={<Plus className="w-3.5 h-3.5" />}>
            {saving ? "Adding…" : "Add to Study Room"}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card p-8 text-center">
          <Library className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-secondary)" }} />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No study links yet — be the first to add one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
      <p className="text-sm -mt-2" style={{ color: "var(--text-secondary)" }}>
        Shared learning links. Drop a link, add a thumbnail to represent it, and everyone in CONNEXA can open it.
      </p>
    </section>
  );
}
