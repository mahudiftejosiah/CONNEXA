"use client";

import { useEffect, useRef, useState } from "react";
import { Video, VideoOff, Radio, Square, Send, RotateCcw, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { createPost } from "@/lib/actions/posts";
import type { Profile, PostVisibility } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

export function LiveClient({ profile }: { profile: Profile }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipFile, setClipFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      stopCamera();
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);
    } catch {
      setCameraError("Your browser blocked the camera or microphone. Allow access and try again.");
      setCameraOn(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    if (live) stopBroadcast(false);
  }

  function startBroadcast() {
    const stream = streamRef.current;
    if (!stream) { toast.error("Turn the camera on first."); return; }
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const file = new File([blob], `live_${Date.now()}.webm`, { type: "video/webm" });
      setClipFile(file);
      setClipUrl(URL.createObjectURL(blob));
      setLive(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setLive(true);
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    toast.success("You're live! Your session is recorded and can be shared to your feed when you stop.");
  }

  function stopBroadcast(keepCamera = true) {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    recorderRef.current = null;
    setLive(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!keepCamera) stopCamera();
  }

  function discardClip() {
    if (clipUrl) URL.revokeObjectURL(clipUrl);
    setClipUrl(null);
    setClipFile(null);
  }

  async function shareClip() {
    if (!clipFile) return;
    setPosting(true);
    const fd = new FormData();
    const text = [title.trim(), caption.trim()].filter(Boolean).join("\n\n") || "Live moment 🔴";
    fd.set("content", text);
    fd.set("visibility", "public" as PostVisibility);
    fd.append("media", clipFile);
    const res = await createPost(fd);
    setPosting(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Shared to your feed!");
    stopCamera();
    router.push("/feed");
  }

  const fmt = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/discover" className="p-2 rounded-xl hover:bg-[var(--border)] text-[var(--text-secondary)]" aria-label="Back to Discover">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1">
          <Radio className="w-6 h-6 text-red-500" />
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Go Live</h1>
        </div>
        {live && (
          <span className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full animate-pulse">
            <span className="w-2 h-2 rounded-full bg-white" /> LIVE {fmt}
          </span>
        )}
      </div>

      {/* Stage */}
      <div className="card overflow-hidden">
        <div className="relative aspect-video bg-black">
          <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${cameraOn ? "" : "opacity-0"}`} />
          {!cameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
              <VideoOff className="w-12 h-12" />
              <p className="text-sm">{cameraError || "Camera is off — turn it on to start your session."}</p>
            </div>
          )}
          {live && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" /> REC {fmt}
            </div>
          )}
        </div>

        <div className="p-4 flex flex-wrap items-center gap-3">
          <Avatar src={profile.avatar_url} name={profile.display_name} size={40} userId={profile.id} />
          <div className="flex-1 min-w-[8rem]">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{profile.display_name}</p>
            <p className="text-xs text-[var(--text-secondary)]">@{profile.username}</p>
          </div>
          {!cameraOn ? (
            <Button onClick={startCamera} icon={<Video className="w-4 h-4" />}>Turn on camera</Button>
          ) : !live ? (
            <>
              <Button variant="danger" onClick={startBroadcast} icon={<Radio className="w-4 h-4" />}>Start live session</Button>
              <Button variant="ghost" onClick={stopCamera} icon={<VideoOff className="w-4 h-4" />}>Turn off</Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => stopBroadcast(true)} icon={<Square className="w-4 h-4 fill-current" />}>Stop session</Button>
          )}
        </div>
      </div>

      {/* Clip review */}
      {clipUrl && clipFile && (
        <div className="card p-4 space-y-3">
          <h2 className="font-bold text-[var(--text-primary)]">Your live recording is ready</h2>
          <video src={clipUrl} controls className="w-full rounded-xl bg-black aspect-video object-cover" />
          <input className="input" placeholder="Give it a title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          <textarea className="input min-h-[70px]" placeholder="Say something about it… (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={5000} />
          <div className="flex gap-2">
            <Button onClick={shareClip} loading={posting} icon={<Send className="w-4 h-4" />}>Share to feed</Button>
            <Button variant="ghost" onClick={discardClip} icon={<RotateCcw className="w-4 h-4" />}>Discard</Button>
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--text-secondary)] text-center leading-relaxed">
        Your session runs in your browser — CONNEXA records it and posts it to your feed, no third‑party streaming service involved.
        Your camera never turns on until you press “Turn on camera”.
      </p>
    </div>
  );
}
