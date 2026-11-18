"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play, Sparkles, ArrowRight, ArrowUpRight } from "lucide-react";
import { slideHref, isExternalHref, type FeaturedSlide } from "@/lib/slides";

// The homepage's promotional carousel. It autoplays on each slide's own
// duration, pauses the moment a reader touches, hovers, focuses or scrolls it
// out of view, and resumes when they let go. Only the active frame and its
// neighbours are downloaded, so a fifteen-slide reel never pulls fifteen
// full-resolution images at once.
export function FeaturedSlideshow({ slides }: { slides: FeaturedSlide[] }) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [inView, setInView] = useState(true);
  const [pageHidden, setPageHidden] = useState(false);
  const [runId, setRunId] = useState(0);
  const [loaded, setLoaded] = useState<number[]>(() => [0, 1, Math.max(0, count - 1)]);

  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, dx: 0, active: false, moved: false });

  const paused = userPaused || hovered || focused || touching || !inView || pageHidden || count < 2;
  const duration = slides[index]?.duration_ms ?? 6000;

  const goTo = useCallback((next: number) => {
    if (count === 0) return;
    setIndex(((next % count) + count) % count);
  }, [count]);

  // The autoplay clock. It only runs while nothing is pausing it, and it
  // restarts whenever the slide or the paused state changes.
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), duration);
    return () => clearTimeout(timer);
  }, [paused, index, count, duration]);

  // Restart the progress hairline in step with the clock each time it runs.
  useEffect(() => {
    if (!paused) setRunId((r) => r + 1);
  }, [paused]);

  // Download the current frame and its neighbours, and warm the next one.
  useEffect(() => {
    if (count === 0) return;
    const want = [index, (index + 1) % count, (index - 1 + count) % count];
    setLoaded((prev) => {
      const merged = Array.from(new Set(prev.concat(want)));
      return merged.length === prev.length ? prev : merged;
    });
    const next = slides[(index + 1) % count];
    if (next) {
      const img = new Image();
      img.src = next.image_url;
    }
  }, [index, count, slides]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => setInView(entries[0]?.isIntersecting ?? true), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVis = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Keep the index valid if the admin removes slides while this is mounted.
  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  if (count === 0) return null;

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, dx: 0, active: true, moved: false };
    setTouching(true);
    rootRef.current?.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active) return;
    drag.current.dx = e.clientX - drag.current.x;
    if (Math.abs(drag.current.dx) > 8) drag.current.moved = true;
  }
  function onPointerUp() {
    if (!drag.current.active) return;
    const dx = drag.current.dx;
    drag.current.active = false;
    setTouching(false);
    if (Math.abs(dx) > 48) goTo(dx < 0 ? index + 1 : index - 1);
  }
  function onClickCapture(e: React.MouseEvent) {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(index - 1); }
    else if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); setUserPaused((p) => !p); }
  }

  return (
    <section
      ref={rootRef}
      aria-roledescription="carousel"
      aria-label="Featured on CONNEXA"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      className={`relative rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--bg-card)] shadow-sm select-none outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--a-800))] aspect-[16/9] ${paused ? "cx-paused" : ""}`}
      style={{ "--cx-dur": `${duration}ms`, touchAction: "pan-y" } as React.CSSProperties}
    >
      {slides.map((slide, i) => {
        const active = i === index;
        const href = slideHref(slide);
        const external = href ? isExternalHref(href) : false;
        const showCta = !!href && slide.cta_enabled && slide.cta_text.trim().length > 0;
        const media = loaded.includes(i) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.image_url}
            alt={slide.alt || slide.title || "Featured slide"}
            className="cx-slide-img"
            loading={i === 0 ? "eager" : "lazy"}
            draggable={false}
            {...(i === 0 ? { fetchPriority: "high" as const } : {})}
          />
        ) : (
          <div className="cx-placeholder w-full h-full" aria-hidden="true" />
        );

        const copy = (
          <>
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
            <div className="absolute inset-x-0 top-0 h-16 pointer-events-none bg-gradient-to-b from-black/45 to-transparent" />
            <div
              key={active ? `copy-${index}` : `idle-${i}`}
              className={`absolute inset-x-0 bottom-0 px-4 sm:px-6 pb-9 sm:pb-10 ${active ? "cx-slide-copy" : ""}`}
            >
              {slide.title && (
                <h3 className="text-white font-extrabold leading-tight text-base sm:text-2xl drop-shadow-md max-w-[85%]">
                  {slide.title}
                </h3>
              )}
              {slide.description && (
                <p className="mt-1 text-white/85 text-[11px] sm:text-sm leading-snug line-clamp-2 max-w-[75%] sm:max-w-[65%] drop-shadow">
                  {slide.description}
                </p>
              )}
              {showCta && (
                <span
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] sm:text-xs font-extrabold tracking-wide shadow-lg transition-transform group-hover:scale-[1.04]"
                  style={{ backgroundColor: "var(--brand-gold, #d6b875)", color: "#1a1408" }}
                >
                  {slide.cta_text}
                  {external ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                </span>
              )}
            </div>
          </>
        );

        const body = (
          <div className={`relative w-full h-full overflow-hidden ${href ? "group cursor-pointer" : "cursor-default"}`}>
            {media}
            {copy}
          </div>
        );

        return (
          <div
            key={slide.id}
            className="cx-frame"
            data-active={active}
            role="group"
            aria-roledescription="slide"
            aria-label={`Slide ${i + 1} of ${count}${slide.title ? `: ${slide.title}` : ""}`}
            aria-hidden={!active}
          >
            {href ? (
              external ? (
                <a href={href} target="_blank" rel="noopener noreferrer" tabIndex={active ? 0 : -1} className="block w-full h-full">
                  {body}
                </a>
              ) : (
                <Link href={href} tabIndex={active ? 0 : -1} className="block w-full h-full">
                  {body}
                </Link>
              )
            ) : (
              body
            )}
          </div>
        );
      })}

      {/* Top chrome: the featured mark, the counter and the pause switch. */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 sm:px-4 pt-3 pointer-events-none">
        <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-widest text-white bg-black/40 cx-arrow">
          <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--brand-gold, #d6b875)" }} />
          Featured
        </span>
        <span className="pointer-events-auto flex items-center gap-2">
          <span className="rounded-full px-2.5 py-1 text-[10px] sm:text-[11px] font-bold tabular-nums text-white/90 bg-black/40 cx-arrow" aria-live="polite">
            {index + 1} / {count}
          </span>
          {count > 1 && (
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={userPaused ? "Resume the slideshow" : "Pause the slideshow"}
              aria-pressed={userPaused}
              className="cx-arrow rounded-full w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-black/40 text-white hover:bg-black/60"
            >
              {userPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
            </button>
          )}
        </span>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            aria-label="Previous slide"
            className="cx-arrow absolute left-2 sm:left-3 top-1/2 -mt-4 sm:-mt-5 z-10 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-black/40 text-white hover:bg-black/60"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            aria-label="Next slide"
            className="cx-arrow absolute right-2 sm:right-3 top-1/2 -mt-4 sm:-mt-5 z-10 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-black/40 text-white hover:bg-black/60"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          {/* Progress indicators — the active one burns down over the slide's duration. */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-1.5 px-4 sm:px-6 pb-3">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}${slide.title ? `: ${slide.title}` : ""}`}
                aria-current={i === index}
                className="group/dot relative h-1.5 flex-1 rounded-full overflow-hidden bg-white/25 hover:bg-white/40 transition-colors"
              >
                {i === index && (
                  <span
                    key={`${index}-${runId}`}
                    className="cx-progress-fill absolute inset-y-0 left-0 rounded-full"
                  />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}