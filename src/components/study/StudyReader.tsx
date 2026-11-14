"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, BookOpen, ExternalLink, Highlighter, Layers,
  RotateCcw, Type, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { gutenbergId } from "@/lib/gutenberg";
import type { StudyBook, StudyHighlight, StudyHighlightInsert, StudyProgressInsert } from "@/lib/supabase/types";
import toast from "react-hot-toast";

// One page is about a screenful of the reading column, so a turn always lands
// on a full page. The three sizes line up with FONT_SIZES below.
const PAGE_CHARS = [1500, 1150, 880];
const FONT_SIZES = [15, 17, 20];

interface Saved {
  position: number;
  percent: number;
}

interface SelRange {
  paragraph: number;
  start: number;
  end: number;
  text: string;
}

// Where a DOM point sits in the paragraph's plain text. The reader's DOM is
// only ever a paragraph holding text and highlighted spans, so both kinds of
// boundary point — inside a text node and between children — are measurable.
function charOffset(el: HTMLElement, node: Node, offset: number): number {
  if (node !== el && !el.contains(node)) return -1;
  if (node.nodeType === Node.TEXT_NODE) {
    let n = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (t === node) return n + offset;
      n += (t.nodeValue || "").length;
    }
    return -1;
  }
  let n = 0;
  const kids = Array.from(node.childNodes);
  for (let i = 0; i < offset && i < kids.length; i++) n += (kids[i].textContent || "").length;
  if (node !== el) {
    let walk: Node | null = node.previousSibling;
    while (walk) {
      n += (walk.textContent || "").length;
      walk = walk.previousSibling;
    }
  }
  return n;
}

export function StudyReader({ book, userId, saved }: { book: StudyBook; userId: string; saved: Saved | null }) {
  const [paragraphs, setParagraphs] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [fontFace, setFontFace] = useState(1);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "off">("idle");
  const [marks, setMarks] = useState<StudyHighlight[]>([]);
  const [marksOff, setMarksOff] = useState(false);
  const [selection, setSelection] = useState<SelRange[] | null>(null);
  const [offer, setOffer] = useState<{ page: number; percent: number } | null>(null);
  const [jump, setJump] = useState("");

  const articleRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offered = useRef(false);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  supabaseRef.current = supabaseRef.current || createClient();
  const supabase = supabaseRef.current;

  // Titles Gutenberg only publishes as a scan keep pointing at the outside PDF.
  const external = gutenbergId(book.pdf_url) ? null : book.pdf_url;

  // The text comes from the app's own route, which pulls it off Project
  // Gutenberg once and keeps the copy warm for everyone reading that title.
  useEffect(() => {
    if (external) return;
    let alive = true;
    fetch(`/api/study-text?book=${book.id}`)
      .then(async (res) => {
        const body = await res.json();
        if (!alive) return;
        if (!res.ok) { setError(body.error || "The book could not be opened."); return; }
        if (body.external) { setError(null); setParagraphs(null); return; }
        setParagraphs(body.paragraphs as string[]);
      })
      .catch(() => { if (alive) setError("The book could not be opened. Check your connection."); });
    return () => { alive = false; };
  }, [book.id, external]);

  // Page breaks land between paragraphs, so a paragraph never splits in half.
  const pageStarts = useMemo(() => {
    if (!paragraphs) return null;
    const budget = PAGE_CHARS[fontFace];
    const starts = [0];
    let chars = 0;
    paragraphs.forEach((text, i) => {
      const len = text.length + 1;
      if (chars + len > budget && starts[starts.length - 1] !== i) {
        starts.push(i);
        chars = len;
      } else {
        chars += len;
      }
    });
    return starts;
  }, [paragraphs, fontFace]);

  const totalPages = pageStarts?.length || 0;
  const percent = totalPages > 1 ? Math.min(100, Math.round((page / (totalPages - 1)) * 100)) : 100;

  // A larger type sets fewer words on a sheet, so the page you were on can fall
  // off the end of the new pagination. It cannot — the book just ends there.
  useEffect(() => {
    if (totalPages && page > totalPages - 1) setPage(totalPages - 1);
  }, [totalPages, page]);

  const pageOf = useCallback((position: number) => {
    if (!pageStarts) return 0;
    let found = 0;
    for (let i = 0; i < pageStarts.length; i++) {
      if (pageStarts[i] <= position) found = i;
      else break;
    }
    return found;
  }, [pageStarts]);

  const pageEnd = pageStarts ? (pageStarts[Math.min(page + 1, pageStarts.length - 1)] ?? paragraphs?.length ?? 0) : 0;
  const pageFrom = pageStarts?.[page] ?? 0;
  const shown = paragraphs ? paragraphs.slice(pageFrom, page === totalPages - 1 ? paragraphs.length : pageEnd) : [];

  const byParagraph = useMemo(() => {
    const map = new Map<number, StudyHighlight[]>();
    for (const m of marks) {
      const list = map.get(m.paragraph);
      if (list) list.push(m);
      else map.set(m.paragraph, [m]);
    }
    return map;
  }, [marks]);

  // Where the reader stopped is remembered as a paragraph, which survives a
  // change of text size — the page it sits on is worked out from that.
  useEffect(() => {
    if (!paragraphs || !pageStarts || !saved || saved.position <= 0 || offered.current) return;
    const at = pageOf(saved.position);
    if (at > 0) {
      offered.current = true;
      setOffer({ page: at, percent: saved.percent });
    }
  }, [paragraphs, pageStarts, saved, pageOf]);

  // The reader's own marks, one row per range they highlighted in this title.
  useEffect(() => {
    if (!paragraphs) return;
    let alive = true;
    supabase
      .from("study_book_highlights")
      .select("id, paragraph, start_char, end_char")
      .eq("user_id", userId)
      .eq("book_id", book.id)
      .order("paragraph", { ascending: true })
      .order("start_char", { ascending: true })
      .then(({ data, error: loadError }) => {
        if (!alive) return;
        if (loadError) { setMarksOff(true); return; }
        setMarksOff(false);
        setMarks((data || []) as StudyHighlight[]);
      });
    return () => { alive = false; };
  }, [paragraphs, book.id, supabase, userId]);

  const persist = useCallback(async (position: number, pct: number) => {
    setSaveState("saving");
    const payload: StudyProgressInsert = {
      user_id: userId,
      book_id: book.id,
      position,
      percent: pct,
    };
    if (pct >= 99) payload.finished_at = new Date().toISOString();
    const { error: saveError } = await supabase
      .from("study_progress")
      .upsert(payload, { onConflict: "user_id,book_id" });
    // An unknown table only means migration 018 is not applied yet — reading
    // still works, the marker simply does not carry to the next visit.
    setSaveState(saveError ? "off" : "saved");
  }, [book.id, supabase, userId]);

  useEffect(() => {
    if (!paragraphs || !pageStarts) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // A book nobody has turned yet has nothing worth remembering.
    if (page === 0 && (!saved || saved.position === 0)) return;
    saveTimer.current = setTimeout(() => void persist(pageFrom, percent), 900);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [page, pageFrom, percent, paragraphs, pageStarts, persist, saved]);

  // Leaving in a hurry should not lose the place either.
  useEffect(() => {
    const flush = () => {
      if (paragraphs && pageStarts) void persist(pageFrom, percent);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [pageFrom, percent, paragraphs, pageStarts, persist]);

  function turn(next: number) {
    if (!totalPages) return;
    const target = Math.max(0, Math.min(totalPages - 1, next));
    if (target === page) return;
    setDir(target > page ? "fwd" : "back");
    setPage(target);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    stageRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  // Page turns on the arrow keys, unless a field is holding the caret.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (!totalPages) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); turn(page + 1); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); turn(page - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const read = () => {
      const sel = window.getSelection();
      const el = articleRef.current;
      if (!sel || sel.isCollapsed || !sel.rangeCount || !el) { setSelection(null); return; }
      const range = sel.getRangeAt(0);
      const text = sel.toString();
      if (!text.trim() || !el.contains(range.commonAncestorContainer)) { setSelection(null); return; }
      const parts: SelRange[] = [];
      el.querySelectorAll<HTMLElement>("[data-i]").forEach((node) => {
        if (!range.intersectsNode(node)) return;
        const full = node.textContent || "";
        const rawStart = charOffset(node, range.startContainer, range.startOffset);
        const rawEnd = charOffset(node, range.endContainer, range.endOffset);
        const start = Math.max(0, Math.min(rawStart < 0 ? 0 : rawStart, full.length));
        const end = Math.max(start, Math.min(rawEnd < 0 ? full.length : rawEnd, full.length));
        if (end > start) {
          parts.push({ paragraph: Number(node.dataset.i), start, end, text: full.slice(start, end) });
        }
      });
      setSelection(parts.length ? parts : null);
    };
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, []);

  async function highlightSelection() {
    if (!selection) return;
    const payload: StudyHighlightInsert[] = selection.map((r) => ({
      user_id: userId,
      book_id: book.id,
      paragraph: r.paragraph,
      start_char: r.start,
      end_char: r.end,
    }));
    const { data, error: insertError } = await supabase
      .from("study_book_highlights")
      .insert(payload)
      .select("id, paragraph, start_char, end_char");
    if (insertError) {
      // The table is migration 024. Without it the mark cannot be kept, so it
      // is not drawn at all rather than vanishing on the next page turn.
      setMarksOff(true);
      toast.error("Nothing is being marked — migration 024 has not been applied yet.");
      return;
    }
    setMarks((prev) => {
      const seen = new Set(prev.map((m) => `${m.paragraph}:${m.start_char}:${m.end_char}`));
      const added = ((data || []) as StudyHighlight[]).filter((m) => !seen.has(`${m.paragraph}:${m.start_char}:${m.end_char}`));
      return [...prev, ...added].sort((a, b) => a.paragraph - b.paragraph || a.start_char - b.start_char);
    });
    setMarksOff(false);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    toast.success("Marked. It is here when you open the book again.");
  }

  async function removeMark(id: string) {
    const { error: deleteError } = await supabase.from("study_book_highlights").delete().eq("id", id);
    if (deleteError) { toast.error("The mark could not be lifted."); return; }
    setMarks((prev) => prev.filter((m) => m.id !== id));
    toast("Highlight removed.");
  }

  async function copySelection() {
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection.map((r) => r.text).join(" "));
      toast.success("Copied.");
    } catch {
      toast.error("This browser will not let the page copy for you. Use the usual copy command.");
    }
  }

  function jumpTo(event: React.FormEvent) {
    event.preventDefault();
    const n = Number.parseInt(jump, 10);
    if (!Number.isFinite(n) || n < 1 || n > totalPages) {
      toast.error(`Type a page between 1 and ${totalPages}.`);
      return;
    }
    turn(n - 1);
    setJump("");
  }

  function restart() {
    setOffer(null);
    turn(0);
    toast("Back to the first page.");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Link
          href="/discover"
          className="mt-0.5 w-9 h-9 rounded-full border flex items-center justify-center flex-none"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          aria-label="Back to the Study Room"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold leading-tight" style={{ color: "var(--text-primary)" }}>{book.title}</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {book.author || "Project Gutenberg"} ·{" "}
            {totalPages ? `${totalPages.toLocaleString()} pages` : "opening…"}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-none">
          <button
            onClick={() => setFontFace((f) => (f + FONT_SIZES.length - 1) % FONT_SIZES.length)}
            className="w-9 h-9 rounded-full border flex items-center justify-center"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            aria-label="Change text size"
          >
            <Type className="w-4 h-4" />
          </button>
          <button
            onClick={restart}
            className="w-9 h-9 rounded-full border flex items-center justify-center"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
            aria-label="Start the book again from the beginning"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${percent}%`, background: "linear-gradient(90deg, rgb(var(--a-600)), rgb(var(--b-400)))" }}
        />
      </div>

      {external && (
        <div className="card p-5 text-center space-y-3">
          <BookOpen className="w-7 h-7 mx-auto" style={{ color: "rgb(var(--a-700))" }} />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            This title is not published as plain text, so it opens where it lives.
            CONNEXA cannot remember a page in another site.
          </p>
          <a href={external} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm inline-flex items-center gap-1.5">
            Open it <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {error && !external && (
        <div className="card p-5 text-center space-y-3">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{error}</p>
          <a href={book.pdf_url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-sm inline-flex items-center gap-1.5">
            Read it on Project Gutenberg <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {!paragraphs && !error && !external && (
        <div className="card p-8 text-center">
          <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "rgb(var(--a-600))", borderTopColor: "transparent" }} />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Fetching the book from Project Gutenberg…</p>
        </div>
      )}

      {offer && paragraphs && (
        <div className="card p-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              You stopped on page {offer.page + 1}
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{offer.percent}% of this book read.</p>
          </div>
          <button
            onClick={() => { const at = offer.page; setOffer(null); turn(at); }}
            className="btn-primary text-sm"
          >
            Continue reading
          </button>
          <button onClick={() => setOffer(null)} className="btn-ghost text-sm">
            Start from page 1
          </button>
        </div>
      )}

      {paragraphs && (
        <div ref={stageRef} className="study-stage">
          <article
            key={`${page}-${dir}`}
            ref={articleRef}
            className="study-page study-page--turned"
            data-dir={dir}
            style={{ fontSize: `${FONT_SIZES[fontFace]}px` }}
            onClick={(e) => {
              const mark = (e.target as HTMLElement).closest<HTMLElement>("mark[data-h]");
              if (mark) void removeMark(mark.dataset.h as string);
            }}
          >
            {shown.map((text, i) => (
              <p key={pageFrom + i} data-i={pageFrom + i} className="study-page__para">
                <ParaText text={text} marks={byParagraph.get(pageFrom + i)} />
              </p>
            ))}
            {page === totalPages - 1 && (
              <p className="study-page__end">— end of {book.title} —</p>
            )}
          </article>
        </div>
      )}

      {selection && (
        <div className="study-selectbar" role="toolbar" aria-label="Selection tools">
          <span className="study-selectbar__quote" title={selection.map((r) => r.text).join(" ")}>
            {selection.map((r) => r.text).join(" ")}
          </span>
          <button onClick={() => void highlightSelection()} className="study-selectbar__btn">
            <Highlighter className="w-3.5 h-3.5" /> Highlight
          </button>
          <button onClick={() => void copySelection()} className="study-selectbar__btn study-selectbar__btn--ghost">
            Copy
          </button>
          <button onClick={() => { window.getSelection()?.removeAllRanges(); setSelection(null); }}
            className="study-selectbar__btn study-selectbar__btn--ghost" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {paragraphs && (
        <div className="study-nav card p-3">
          <button onClick={() => turn(page - 1)} disabled={page === 0}
            className="study-nav__btn" aria-label="Previous page">
            <ArrowLeft className="w-4 h-4" /> <span>Previous</span>
          </button>

          <div className="study-nav__center">
            <span className="study-nav__count">
              <Layers className="w-3.5 h-3.5 inline-block mr-1" aria-hidden="true" />
              Page <strong>{page + 1}</strong> of {totalPages.toLocaleString()}
            </span>
            <form onSubmit={jumpTo} className="study-nav__jump">
              <input
                type="number"
                min={1}
                max={totalPages}
                inputMode="numeric"
                value={jump}
                onChange={(e) => setJump(e.target.value)}
                placeholder="Page…"
                aria-label="Jump to page number"
                className="study-nav__input"
              />
              <button type="submit" className="study-nav__go" disabled={!totalPages}>Go</button>
            </form>
          </div>

          <button onClick={() => turn(page + 1)} disabled={page >= totalPages - 1}
            className="study-nav__btn" aria-label="Next page">
            <span>Next</span> <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <p className="text-[11px] text-center" style={{ color: "var(--text-secondary)" }} aria-live="polite">
        {saveState === "off"
          ? "Pages are not being kept yet — migration 018 has not been applied."
          : saveState === "saving"
            ? "Remembering your page…"
            : saveState === "saved"
              ? `Page ${page + 1} saved · ${percent}% read`
              : marksOff
                ? "Pages are remembered as you turn them. Highlights need migration 024 before they can be kept."
                : "Your page is saved as you turn it. Select any words to highlight them."}
      </p>
    </div>
  );
}

function ParaText({ text, marks }: { text: string; marks?: StudyHighlight[] }) {
  if (!marks?.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let cursor = 0;
  marks.forEach((m, i) => {
    const start = Math.max(cursor, m.start_char);
    const end = Math.min(text.length, m.end_char);
    if (end <= start) return;
    if (start > cursor) out.push(text.slice(cursor, start));
    out.push(
      <mark key={m.id ?? `m${i}`} data-h={m.id} className="study-hl" title="Remove this highlight">
        {text.slice(start, end)}
      </mark>
    );
    cursor = end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}
