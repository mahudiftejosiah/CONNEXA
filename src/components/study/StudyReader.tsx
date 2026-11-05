"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, ExternalLink, RotateCcw, Type } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { gutenbergId } from "@/lib/gutenberg";
import type { StudyBook, StudyProgressInsert } from "@/lib/supabase/types";
import toast from "react-hot-toast";

const BATCH = 110;
const FONT_SIZES = [15, 17, 20];

interface Saved {
  position: number;
  percent: number;
}

export function StudyReader({ book, userId, saved }: { book: StudyBook; userId: string; saved: Saved | null }) {
  const [paragraphs, setParagraphs] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(0);
  const [count, setCount] = useState(BATCH);
  const [current, setCurrent] = useState(0);
  const [fontFace, setFontFace] = useState(1);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "off">("idle");

  const articleRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumed = useRef(false);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  supabaseRef.current = supabaseRef.current || createClient();
  const supabase = supabaseRef.current;

  const total = paragraphs?.length || 0;
  const percent = total > 1 ? Math.min(100, Math.round((current / (total - 1)) * 100)) : 0;

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

  // Drop the reader back where they left off, a few lines above so the sentence
  // before the marker is on screen too.
  useEffect(() => {
    if (!paragraphs || resumed.current) return;
    resumed.current = true;
    const at = Math.max(0, saved?.position || 0);
    if (at > 0) {
      setFrom(Math.max(0, at - 2));
      setCount(at - Math.max(0, at - 2) + BATCH);
      requestAnimationFrame(() => {
        const target = articleRef.current?.querySelector(`[data-i="${at}"]`);
        target?.scrollIntoView({ block: "start" });
        setCurrent(at);
        toast.success(`Resumed at ${saved?.percent ?? 0}%`);
      });
    }
  }, [paragraphs, saved]);

  // The paragraph sitting across the middle of the screen is the one being read.
  useEffect(() => {
    if (!paragraphs) return;
    const nodes = articleRef.current?.querySelectorAll<HTMLElement>("[data-i]");
    if (!nodes?.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(Number((entry.target as HTMLElement).dataset.i));
        }
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [paragraphs, from, count]);

  // Keep rendering as the reader runs out of page.
  useEffect(() => {
    if (!paragraphs) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setCount((c) => Math.min(c + BATCH, paragraphs.length));
    }, { rootMargin: "600px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [paragraphs]);

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
    if (!paragraphs || current <= 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(current, percent), 1200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [current, percent, paragraphs, persist]);

  // Leaving in a hurry should not lose the place either.
  useEffect(() => {
    const flush = () => {
      if (paragraphs && current > 0) void persist(current, percent);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [current, percent, paragraphs, persist]);

  function restart() {
    setFrom(0);
    setCount(BATCH);
    setCurrent(0);
    window.scrollTo({ top: 0 });
    toast("Back to the first page.");
  }

  const shown = paragraphs ? paragraphs.slice(from, Math.min(from + count, total)) : [];

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
            {book.author || "Project Gutenberg"} · {total ? `${total.toLocaleString()} passages` : "opening…"}
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

      {paragraphs && (
        <article
          ref={articleRef}
          className="study-page"
          style={{ fontSize: `${FONT_SIZES[fontFace]}px` }}
        >
          {shown.map((text, i) => (
            <p key={from + i} data-i={from + i} className="study-page__para">
              {text}
            </p>
          ))}
          <div ref={sentinelRef} className="h-px" />
          {from + count >= total && (
            <p className="study-page__end">
              — end of {book.title} —
            </p>
          )}
        </article>
      )}

      <p className="text-[11px] text-center" style={{ color: "var(--text-secondary)" }} aria-live="polite">
        {saveState === "off"
          ? "Progress is not being kept yet — migration 018 has not been applied."
          : saveState === "saving"
            ? "Remembering your place…"
            : saveState === "saved"
              ? `Place saved at ${percent}%`
              : "Your place is saved automatically as you read."}
      </p>
    </div>
  );
}
