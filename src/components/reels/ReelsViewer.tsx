"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, MessageCircle, Share2, Volume2, VolumeX, Play, Pause, X, Maximize2, Clapperboard } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CommentSection } from "@/components/posts/CommentSection";
import { toggleReaction, sharePost } from "@/lib/actions/posts";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";
import toast from "react-hot-toast";

type Reel =
  | { kind: "embed"; id: string; platform: "tiktok" | "youtube"; external_id: string; caption: string | null }
  | {
      kind: "post";
      id: string;
      content: string;
      created_at: string;
      reaction_count: number;
      video_url: string;
      user_liked?: boolean;
      author: { id: string; username: string; display_name: string; avatar_url: string | null };
    };

interface ReelsViewerProps {
  profile: Profile | null;
  // The /reels route owns the whole viewport; inside the feed it is a card.
  fullscreen?: boolean;
  onClose?: () => void;
}

// TikTok's embed ships its own player chrome and answers to no external
// command, so the play/pause button only appears for the sources that really
// respond to it — a dead control is worse than an absent one.
const canCommand = (r: Reel) => r.kind === "post" || r.platform === "youtube";

export function ReelsViewer({ profile, fullscreen = false, onClose }: ReelsViewerProps) {
  const [reels, setReels] = useState<Reel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState<Record<number, boolean>>({});
  const [expanded, setExpanded] = useState(false);
  const [commenting, setCommenting] = useState<Reel | null>(null);
  const [sharing, setSharing] = useState(false);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scroller = useRef<HTMLDivElement | null>(null);

  const full = fullscreen || expanded;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reels")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setReels(d.reels || []); })
      .catch(() => { if (!cancelled) { setFailed(true); setReels([]); } });
    return () => { cancelled = true; };
  }, []);

  // Autoplay the reel occupying the viewport, pause the rest.
  useEffect(() => {
    if (!reels || reels.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = Number((entry.target as HTMLElement).dataset.idx);
          const video = (entry.target as HTMLElement).querySelector("video");
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            setActive(idx);
            if (video) {
              video.muted = muted;
              video.play().catch(() => {});
            }
          } else if (video) {
            video.pause();
          }
        });
      },
      { threshold: [0, 0.6, 1] }
    );
    itemRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [reels, muted]);

  useEffect(() => {
    document.querySelectorAll<HTMLVideoElement>("[data-reel-video]").forEach((v) => { v.muted = muted; });
  }, [muted]);

  // An overlay player must not scroll the page behind it.
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [full]);

  function goTo(idx: number) {
    const el = scroller.current;
    if (!el || !reels) return;
    const next = Math.max(0, Math.min(reels.length - 1, idx));
    el.scrollTo({ top: next * el.clientHeight, behavior: "smooth" });
    setActive(next);
  }

  function exit() {
    if (fullscreen) onClose?.();
    else setExpanded(false);
  }

  // The reel player is the whole screen, so the keyboard drives it.
  useEffect(() => {
    if (!full) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (commenting) setCommenting(null);
        else exit();
        return;
      }
      if (commenting) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); goTo(active + 1); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); goTo(active - 1); }
      else if (e.key === " ") { e.preventDefault(); togglePlay(active); }
      else if (e.key.toLowerCase() === "m") setMuted((m) => !m);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function command(idx: number, func: string) {
    const frame = itemRefs.current[idx]?.querySelector("iframe");
    frame?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");
  }

  function togglePlay(idx: number) {
    const reel = reels?.[idx];
    if (!reel || !canCommand(reel)) return;
    const isPlaying = playing[idx] ?? true;
    if (reel.kind === "post") {
      const video = itemRefs.current[idx]?.querySelector("video");
      if (!video) return;
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    } else {
      command(idx, isPlaying ? "pauseVideo" : "playVideo");
    }
    setPlaying((p) => ({ ...p, [idx]: !isPlaying }));
  }

  function toggleLike(idx: number) {
    const reel = reels![idx];
    if (reel.kind !== "post") return;
    setReels((prev) => prev!.map((r, i) =>
      i === idx && r.kind === "post" ? { ...r, reaction_count: r.reaction_count + (r.user_liked ? -1 : 1), user_liked: !r.user_liked } : r
    ));
    toggleReaction(reel.id, "like").then((res: any) => {
      if (res?.error) toast.error(res.error);
      else if (res?.changed === false) {
        setReels((prev) => prev!.map((r, i) =>
          i === idx && r.kind === "post" ? { ...r, reaction_count: r.reaction_count - 1, user_liked: false } : r
        ));
      }
    });
  }

  async function share(reel: Reel) {
    if (reel.kind !== "post") return;
    setSharing(true);
    const res = await sharePost(reel.id, reel.content || "", "public");
    setSharing(false);
    if (res.error) toast.error(res.error);
    else toast.success("Reel shared to your feed.");
  }

  if (failed) {
    return <p className="text-sm text-[var(--text-secondary)] p-6 text-center">Could not load reels right now.</p>;
  }
  if (!reels) {
    return (
      <div className="card h-[70dvh] flex flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
        <Clapperboard className="w-10 h-10 animate-pulse" />
        <p className="text-sm">Rolling the reels…</p>
      </div>
    );
  }
  if (reels.length === 0) {
    return (
      <div className="card h-[70dvh] flex flex-col items-center justify-center gap-2 text-center px-6">
        <Clapperboard className="w-10 h-10 text-[var(--text-secondary)]" />
        <p className="font-semibold text-[var(--text-primary)]">No reels yet</p>
        <p className="text-sm text-[var(--text-secondary)]">Videos posted by people you can see will appear here, TikTok-style.</p>
      </div>
    );
  }

  const reel = reels[active];
  const isPlaying = playing[active] ?? true;

  return (
    <div className={cn(full ? "fixed inset-0 z-[110] bg-black" : "relative")}>
      <div
        ref={scroller}
        className={cn(
          "overflow-y-scroll snap-y snap-mandatory bg-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          full ? "h-full" : "h-[70dvh] sm:h-[75dvh] rounded-2xl"
        )}
      >
        {reels.map((reel, idx) => (
          <div key={reel.id} data-idx={idx}
            ref={(el) => { itemRefs.current[idx] = el; }}
            className="relative h-full snap-start snap-always overflow-hidden">

            {reel.kind === "post" ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  data-reel-video
                  src={reel.video_url}
                  loop
                  playsInline
                  muted={muted}
                  className="h-full w-full object-cover"
                  onClick={() => togglePlay(idx)}
                />
                {(playing[idx] === false) && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                      <Play className="w-8 h-8 text-white fill-white" />
                    </div>
                  </div>
                )}
              </>
            ) : active === idx ? (
              reel.platform === "youtube" ? (
                <iframe
                  // remount on mute change so autoplay-with-sound works after unmute
                  key={`yt-${reel.external_id}-${muted}`}
                  src={`https://www.youtube-nocookie.com/embed/${reel.external_id}?autoplay=1&mute=${muted ? 1 : 0}&playsinline=1&rel=0&controls=0&loop=1&enablejsapi=1&playlist=${reel.external_id}`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                  title="YouTube reel"
                />
              ) : (
                <iframe
                  key={`tt-${reel.external_id}`}
                  src={`https://www.tiktok.com/embed/v2/${reel.external_id}`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full bg-black"
                  title="TikTok reel"
                />
              )
            ) : (
              reel.platform === "youtube" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://img.youtube.com/vi/${reel.external_id}/hqdefault.jpg`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-gradient-to-b from-black via-[#111827] to-black">
                  <Clapperboard className="w-10 h-10 text-white/30" />
                </div>
              )
            )}

            {/* Right action rail — uploaded posts only */}
            {reel.kind === "post" && (
              <div className={cn("absolute right-3 flex flex-col items-center gap-4 text-white", full ? "bottom-28" : "bottom-24")}>
                <button onClick={() => toggleLike(idx)} className="flex flex-col items-center gap-1">
                  <span className="w-11 h-11 rounded-full bg-black/40 backdrop-blur flex items-center justify-center active:scale-90 transition-transform">
                    <Heart className={cn("w-6 h-6", reel.user_liked && "fill-red-500 text-red-500")} />
                  </span>
                  <span className="text-xs font-semibold">{reel.reaction_count}</span>
                </button>
                <button onClick={() => setCommenting(reel)} className="flex flex-col items-center gap-1" aria-label="Comment on this reel">
                  <span className="w-11 h-11 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
                    <MessageCircle className="w-6 h-6" />
                  </span>
                </button>
                <button onClick={() => share(reel)} disabled={sharing} className="flex flex-col items-center gap-1" aria-label="Share this reel">
                  <span className="w-11 h-11 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
                    <Share2 className="w-6 h-6" />
                  </span>
                </button>
              </div>
            )}

            {/* Bottom overlay */}
            <div className={cn(
              "absolute inset-x-0 bottom-0 p-4 pt-12 pointer-events-none",
              full ? "right-20" : "",
              reel.kind === "post"
                ? "bg-gradient-to-t from-black/80 via-black/40 to-transparent"
                : "bg-gradient-to-t from-black/90 via-black/60 to-transparent"
            )}>
              {reel.kind === "post" ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar src={reel.author.avatar_url} name={reel.author.display_name} size={36} userId={reel.author.id} />
                    <div>
                      <Link href={`/profile/${reel.author.username}`} className="font-semibold text-sm text-white hover:underline block leading-tight pointer-events-auto">
                        {reel.author.display_name}
                      </Link>
                      <p className="text-xs text-white/70">@{reel.author.username} · {formatRelativeTime(reel.created_at)}</p>
                    </div>
                  </div>
                  {reel.content && <p className="text-sm text-white/90 line-clamp-2">{reel.content}</p>}
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/15 text-white">
                    {reel.platform === "tiktok" ? "TikTok" : "YouTube"}
                  </span>
                  {reel.caption && <p className="text-sm text-white/90 line-clamp-2">{reel.caption}</p>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Player controls. Everything here stays inside CONNEXA: the sources are
          the platforms' own embed players or our stored video, never a link out. */}
      <div className={cn("absolute top-3 right-3 flex items-center gap-2 z-10", full && "left-3 justify-between")}>
        {full && (
          <button onClick={exit} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center" aria-label="Close reels">
            <X className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-2">
          {canCommand(reel) && (
            <button
              onClick={() => togglePlay(active)}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
          )}
          <button
            onClick={() => setMuted((m) => !m)}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          {!full && (
            <button
              onClick={() => setExpanded(true)}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center"
              aria-label="Open reels full screen"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {full && reels.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-wrap justify-center gap-1.5 z-10 max-w-[70vw]">
          {reels.map((r, i) => (
            <button key={r.id} onClick={() => goTo(i)} aria-label={`Reel ${i + 1}`}
              className={cn("h-1.5 rounded-full transition-all", i === active ? "bg-white w-3" : "bg-white/40 w-1.5")} />
          ))}
        </div>
      )}

      {commenting && commenting.kind === "post" && (
        <div className="absolute inset-x-0 bottom-0 z-20 max-h-[65%] overflow-y-auto rounded-t-3xl border-t border-[var(--border)] p-4 pb-24"
          style={{ backgroundColor: "var(--bg-card)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-[var(--text-primary)]">Comments</p>
            <button onClick={() => setCommenting(null)} aria-label="Close comments" className="p-1.5 rounded-xl hover:bg-[var(--border)]">
              <X className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
          </div>
          <CommentSection postId={commenting.id} currentProfile={profile} />
        </div>
      )}
    </div>
  );
}

// The /reels route: the same player, born fullscreen, with the browser's back
// as its exit.
export function ReelsStage({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  function leave() {
    // Landing on /reels straight from the sidebar means there is nothing in
    // this tab's history to fall back to, so go to the feed instead.
    if (window.history.length > 1) router.back();
    else router.push("/feed");
  }
  return (
    <div className="min-h-screen bg-black">
      <ReelsViewer profile={profile} fullscreen onClose={leave} />
    </div>
  );
}
