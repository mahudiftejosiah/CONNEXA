"use client";

import { useEffect, useRef, useState } from "react";
import { Video, VideoOff, Radio, Square, Send, RotateCcw, ArrowLeft, SwitchCamera } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";
import { CLIP_SLICE_MS, LIVE_BUCKET, clipPath } from "@/lib/live";
import { createPost } from "@/lib/actions/posts";
import { useFullscreen } from "@/lib/useFullscreen";
import type { LiveSession, Profile, PostVisibility } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

export function LiveClient({ profile }: { profile: Profile }) {
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // The clips leave the browser one at a time, in order: a second upload
  // starting while the first is still running would land them out of sequence.
  const queueRef = useRef<Blob[]>([]);
  const uploadingRef = useRef(false);
  const seqRef = useRef(0);
  const pathsRef = useRef<string[]>([]);
  const sessionRef = useRef<LiveSession | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [live, setLive] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clipsUp, setClipsUp] = useState(0);
  const [clipUrl, setClipLocalUrl] = useState<string | null>(null);
  const [clipFile, setClipFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const screen = useFullscreen<HTMLDivElement>();

  useEffect(() => {
    return () => {
      stopCamera();
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera(mode: "user" | "environment" = facing) {
    setCameraError(null);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      // Nothing here mirrors the picture: the stream is shown and recorded
      // exactly as the lens sees it, which is what the viewers get.
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
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

  async function flipCamera() {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    await startCamera(next);
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    if (sessionRef.current && recorderRef.current) stopBroadcast(false);
  }

  /** Pushes one finished clip into storage and moves the session pointer to it. */
  async function drainQueue() {
    if (uploadingRef.current) return;
    const blob = queueRef.current.shift();
    const s = sessionRef.current;
    if (!blob || !s) return;
    uploadingRef.current = true;
    try {
      const seq = seqRef.current + 1;
      const path = clipPath(profile.id, s.id, seq);
      const { error } = await supabase.storage
        .from(LIVE_BUCKET)
        .upload(path, blob, { contentType: "video/webm", upsert: true });
      if (error) return;
      seqRef.current = seq;
      pathsRef.current.push(path);
      await supabase.from("live_sessions")
        .update({ clip_seq: seq, clip_path: path })
        .eq("id", s.id);
      setClipsUp(seq);
    } finally {
      uploadingRef.current = false;
      if (queueRef.current.length > 0) void drainQueue();
    }
  }

  // Full screen is asked for in the click itself, before any await, or the
  // browser treats the later request as an unsolicited one and says no.
  async function startBroadcast() {
    const stream = streamRef.current;
    if (!stream) { toast.error("Turn the camera on first."); return; }
    screen.enter();

    const { data, error } = await supabase.from("live_sessions")
      .insert({ user_id: profile.id, title: title.trim(), status: "live" })
      .select("*")
      .single();
    if (error || !data) {
      toast.error("The session could not start. Check your connection and try again.");
      screen.exit();
      return;
    }
    sessionRef.current = data;

    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const parts: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      parts.push(e.data);
      // Each slice is its own playable WebM, so it can go up straight away.
      queueRef.current.push(new Blob([e.data], { type: mime }));
      void drainQueue();
    };
    recorder.onstop = () => {
      const blob = new Blob(parts, { type: "video/webm" });
      setClipFile(new File([blob], `live_${Date.now()}.webm`, { type: "video/webm" }));
      setClipLocalUrl(URL.createObjectURL(blob));
      setLive(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
    recorder.start(CLIP_SLICE_MS);
    recorderRef.current = recorder;
    setLive(true);
    setSeconds(0);
    setClipsUp(0);
    timerRef.current = setInterval(() => setSeconds((v) => v + 1), 1000);
    toast.success("You're live — your profile cover now shows the broadcast.");
  }

  async function stopBroadcast(exitScreen = true) {
    const s = sessionRef.current;
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    recorderRef.current = null;
    setLive(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (exitScreen) screen.exit();
    if (!s) return;
    sessionRef.current = null;
    // Let the last few slices finish uploading, then close the session and
    // clear the clips: the recap stays on the broadcaster's own screen.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await supabase.from("live_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", s.id);
    if (pathsRef.current.length > 0) {
      await supabase.storage.from(LIVE_BUCKET).remove(pathsRef.current);
      pathsRef.current = [];
    }
    toast("Your live session has ended.", { icon: "🔴" });
  }

  function discardClip() {
    if (clipUrl) URL.revokeObjectURL(clipUrl);
    setClipLocalUrl(null);
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
        <div ref={screen.ref} className={`live-shell${screen.active ? " pseudo-full" : ""}`}>
          <div className={`relative bg-black ${screen.active ? "h-full" : "aspect-video"}`}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
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
            {live && (
              <p className="absolute top-3 right-3 text-white/70 text-[11px] font-semibold">
                {clipsUp} clip{clipsUp === 1 ? "" : "s"} sent to viewers
              </p>
            )}
            {screen.active && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
                {!live && cameraOn && (
                  <Button variant="danger" onClick={startBroadcast} icon={<Radio className="w-4 h-4" />}>Start live</Button>
                )}
                {live && (
                  <Button variant="danger" onClick={() => void stopBroadcast(true)} icon={<Square className="w-4 h-4 fill-current" />}>Stop session</Button>
                )}
                {cameraOn && !live && (
                  <button onClick={flipCamera} aria-label="Flip camera"
                    className="p-3 rounded-full bg-white/15 text-white hover:bg-white/25">
                    <SwitchCamera className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 flex flex-wrap items-center gap-3">
          <Avatar src={profile.avatar_url} name={profile.display_name} size={40} userId={profile.id} />
          <div className="flex-1 min-w-[8rem]">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{profile.display_name}</p>
            <p className="text-xs text-[var(--text-secondary)]">@{profile.username}</p>
          </div>
          {!cameraOn ? (
            <Button onClick={() => void startCamera()} icon={<Video className="w-4 h-4" />}>Turn on camera</Button>
          ) : !live ? (
            <>
              <Button variant="danger" onClick={() => void startBroadcast()} icon={<Radio className="w-4 h-4" />}>Start live session</Button>
              <Button variant="ghost" onClick={flipCamera} icon={<SwitchCamera className="w-4 h-4" />}>Flip</Button>
              <Button variant="ghost" onClick={stopCamera} icon={<VideoOff className="w-4 h-4" />}>Turn off</Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => void stopBroadcast(true)} icon={<Square className="w-4 h-4 fill-current" />}>Stop session</Button>
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
        While you are live your profile cover shows the broadcast to everyone. CONNEXA keeps the recording in
        your browser, so you can post it to your feed when you stop — no third‑party streaming service involved.
        Your camera never turns on until you press “Turn on camera”.
      </p>
    </div>
  );
}
