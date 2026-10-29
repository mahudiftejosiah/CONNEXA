"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Share2, Volume2, VolumeX, Play, ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { toggleReaction } from "@/lib/actions/posts";
import { formatRelativeTime } from "@/lib/utils";
import type { PostWithAuthor } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

interface ReelsClientProps {
  reels: PostWithAuthor[];
  currentUserId: string;
}

export function ReelsClient({ reels, currentUserId }: ReelsClientProps) {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [likes, setLikes] = useState(reels.map((r) => r.reaction_count));
  const [liked, setLiked] = useState(reels.map((r) => !!r.user_reaction));
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = muted;
    if (playing) vid.play().catch(() => {});
    else vid.pause();
  }, [current, muted, playing]);

  const handleScroll = useCallback((e: WheelEvent) => {
    if (e.deltaY > 40 && current < reels.length - 1) setCurrent((c) => c + 1);
    else if (e.deltaY < -40 && current > 0) setCurrent((c) => c - 1);
  }, [current, reels.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleScroll, { passive: true });
    return () => el.removeEventListener("wheel", handleScroll);
  }, [handleScroll]);

  // Touch swipe
  const touchStartY = useRef(0);
  function onTouchStart(e: React.TouchEvent) { touchStartY.current = e.touches[0].clientY; }
  function onTouchEnd(e: React.TouchEvent) {
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (diff > 50 && current < reels.length - 1) setCurrent((c) => c + 1);
    else if (diff < -50 && current > 0) setCurrent((c) => c - 1);
  }

  async function handleLike(index: number) {
    if (!currentUserId) { toast.error("Sign in to like."); return; }
    setLiked((p) => p.map((v, i) => i === index ? !v : v));
    setLikes((p) => p.map((v, i) => i === index ? (liked[index] ? v - 1 : v + 1) : v));
    await toggleReaction(reels[index].id, "like");
  }

  if (reels.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-xl font-bold mb-2">No reels yet</p>
          <p className="text-white/60 text-sm mb-6">Share a video post and it will appear here</p>
          <button onClick={() => router.back()} className="text-brand-gold-400 hover:underline flex items-center gap-2 mx-auto">
            <ArrowLeft className="w-4 h-4" /> Go back
          </button>
        </div>
      </div>
    );
  }

  const reel = reels[current];
  const videoMedia = reel.media?.find((m) => m.type === "video");

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Back button */}
      <button onClick={() => router.back()} className="absolute top-4 left-4 z-20 text-white p-2 bg-black/30 rounded-full hover:bg-black/50">
        <ArrowLeft className="w-5 h-5" />
      </button>

      {/* Video */}
      {videoMedia && (
        <video
          ref={videoRef}
          src={videoMedia.url}
          className="absolute inset-0 w-full h-full object-cover"
          loop
          playsInline
          muted={muted}
          autoPlay
          onClick={() => setPlaying((p) => !p)}
        />
      )}

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

      {/* Play/pause indicator */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
            <Play className="w-8 h-8 text-white ml-1" />
          </div>
        </div>
      )}

      {/* Right actions */}
      <div className="absolute right-4 bottom-32 flex flex-col items-center gap-6 z-10">
        <Link href={`/profile/${reel.author.username}`}>
          <Avatar src={reel.author.avatar_url} name={reel.author.display_name} size={44} className="border-2 border-white" />
        </Link>
        <button onClick={() => handleLike(current)} className="flex flex-col items-center gap-1 text-white">
          <Heart className={`w-7 h-7 ${liked[current] ? "fill-red-500 text-red-500" : ""}`} />
          <span className="text-xs font-medium">{likes[current]}</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-white">
          <MessageCircle className="w-7 h-7" />
          <span className="text-xs font-medium">{reel.comment_count}</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-white">
          <Share2 className="w-7 h-7" />
          <span className="text-xs font-medium">{reel.share_count}</span>
        </button>
        <button onClick={() => setMuted((m) => !m)} className="text-white">
          {muted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-8 left-4 right-20 z-10">
        <Link href={`/profile/${reel.author.username}`} className="flex items-center gap-2 mb-2">
          <span className="text-white font-semibold text-sm">@{reel.author.username}</span>
        </Link>
        {reel.content && <p className="text-white text-sm leading-relaxed line-clamp-2">{reel.content}</p>}
        <p className="text-white/60 text-xs mt-1">{formatRelativeTime(reel.created_at)}</p>
      </div>

      {/* Progress dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
        {reels.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all ${i === current ? "bg-white w-3" : "bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}
