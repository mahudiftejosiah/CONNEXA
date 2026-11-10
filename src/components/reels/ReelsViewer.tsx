"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Volume2, VolumeX, Play, Clapperboard } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { toggleReaction } from "@/lib/actions/posts";
import { formatRelativeTime, cn } from "@/lib/utils";
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

export function ReelsViewer() {
  const [reels, setReels] = useState<Reel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [active, setActive] = useState(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  function tapVideo(idx: number) {
    const el = itemRefs.current[idx];
    const video = el?.querySelector("video");
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  const [playing, setPlaying] = useState<Record<number, boolean>>({});

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

  return (
    <div className="relative">
      <div className="h-[70dvh] sm:h-[75dvh] rounded-2xl overflow-y-scroll snap-y snap-mandatory bg-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                  onClick={() => {
                    tapVideo(idx);
                    setPlaying((p) => ({ ...p, [idx]: !(p[idx] ?? true) }));
                  }}
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
                  src={`https://www.youtube-nocookie.com/embed/${reel.external_id}?autoplay=1&mute=${muted ? 1 : 0}&playsinline=1&rel=0&controls=0&loop=1&playlist=${reel.external_id}`}
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
              <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4 text-white">
                <button onClick={() => toggleLike(idx)} className="flex flex-col items-center gap-1">
                  <span className="w-11 h-11 rounded-full bg-black/40 backdrop-blur flex items-center justify-center active:scale-90 transition-transform">
                    <Heart className={cn("w-6 h-6", reel.user_liked && "fill-red-500 text-red-500")} />
                  </span>
                  <span className="text-xs font-semibold">{reel.reaction_count}</span>
                </button>
                <Link href={`/feed`} className="flex flex-col items-center gap-1" aria-label="Open comments in feed">
                  <span className="w-11 h-11 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
                    <MessageCircle className="w-6 h-6" />
                  </span>
                </Link>
              </div>
            )}

            {/* Bottom overlay */}
            <div className={cn(
              "absolute inset-x-0 bottom-0 p-4 pt-12 pointer-events-none",
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

      <button
        onClick={() => setMuted((m) => !m)}
        className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center z-10"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>
    </div>
  );
}
