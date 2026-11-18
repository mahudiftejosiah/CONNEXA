"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Video, VideoOff, Radio, Square, Send, RotateCcw, ArrowLeft, SwitchCamera, Calendar, Play, Trash2, Lock, Crown } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { LiveChat } from "@/components/live/LiveChat";
import { createClient } from "@/lib/supabase/client";
import { CLIP_SLICE_MS, LIVE_BUCKET, clipPath } from "@/lib/live";
import { createPost } from "@/lib/actions/posts";
import { scheduleStream, cancelScheduledStream, endLiveSession } from "@/lib/actions/pro";
import { useFullscreen } from "@/lib/useFullscreen";
import type { LiveSession, Profile, PostVisibility } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

type Scheduled = { id: string; user_id: string; title: string; scheduled_at: string };

export function LiveClient({ profile, canBroadcast = true, broadcastReason = null }: {
  profile: Profile;
  canBroadcast?: boolean;
  broadcastReason?: string | null;
}) {
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
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [mine, setMine] = useState<Scheduled[]>([]);
  const [upcoming, setUpcoming] = useState<(Scheduled & { host: string })[]>([]);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [schedTitle, setSchedTitle] = useState("");
  const [schedWhen, setSchedWhen] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const screen = useFullscreen<HTMLDivElement>();

  const loadSchedules = useCallback(async () => {
    const { data, error } = await supabase
      .from("live_sessions")
      .select("id, user_id, title, scheduled_at")
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(30);
    if (error) {
      setScheduleNotice(error.code === "42703" || error.message.includes("scheduled_at")
        ? "Scheduling needs migration 033."
        : `Upcoming broadcasts could not be read: ${error.message}`);
      return;
    }
    setScheduleNotice(null);
    const rows = (data ?? []).filter((r) => !!r.scheduled_at) as Scheduled[];
    setMine(rows.filter((r) => r.user_id === profile.id));
    const rest = rows.filter((r) => r.user_id !== profile.id);
    if (!rest.length) { setUpcoming([]); return; }
    const ids = Array.from(new Set(rest.map((r) => r.user_id)));
    const { data: people } = await supabase.from("profiles").select("id, username, display_name").in("id", ids);
    const hostOf = (id: string) => {
      const person = (people ?? []).find((p) => p.id === id);
      return person ? (person.display_name || person.username) : "Someone";
    };
    setUpcoming(rest.map((r) => ({ ...r, host: hostOf(r.user_id) })));
  }, [supabase, profile.id]);

  useEffect(() => { void loadSchedules(); }, [loadSchedules]);

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
  async function startBroadcast(scheduled?: Scheduled) {
    const stream = streamRef.current;
    if (!stream) { toast.error("Turn the camera on first."); return; }
    if (!canBroadcast) { toast.error(broadcastReason ?? "Live streaming is a CONNEXA PRO feature."); return; }
    screen.enter();

    // A scheduled broadcast turns into the live row itself rather than a second
    // one, so the session viewers were told about is the session they watch.
    const res = scheduled
      ? await supabase.from("live_sessions")
          .update({ status: "live", started_at: new Date().toISOString(), title: scheduled.title })
          .eq("id", scheduled.id).eq("status", "scheduled")
          .select("*").single()
      : await supabase.from("live_sessions")
          .insert({ user_id: profile.id, title: title.trim(), status: "live" })
          .select("*").single();
    const { data, error } = res;
    if (error || !data) {
      toast.error("The session could not start. Check your connection and try again.");
      screen.exit();
      return;
    }
    sessionRef.current = data;
    setChatSessionId(data.id);
    if (scheduled) {
      const startedId = scheduled.id;
      setTitle(scheduled.title);
      setMine((prev) => prev.filter((r) => r.id !== startedId));
    }

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
    setChatSessionId(null);
    // Let the last slices finish uploading: the newest one that landed is the
    // highlight the profile cover keeps, and the server clears every other clip.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const highlight = pathsRef.current.length > 0 ? pathsRef.current[pathsRef.current.length - 1] : null;
    pathsRef.current = [];
    const closed = await endLiveSession(s.id, highlight);
    if ("error" in closed) { toast.error(closed.error); return; }
    toast("Your live session has ended.", { icon: "🔴" });
  }

  async function submitSchedule() {
    if (schedTitle.trim().length < 3) { toast.error("Give the broadcast a name."); return; }
    if (!schedWhen) { toast.error("Choose when it starts."); return; }
    setScheduling(true);
    const res = await scheduleStream(schedTitle, new Date(schedWhen).toISOString());
    setScheduling(false);
    if ("error" in res) { toast.error(res.error); return; }
    setSchedTitle("");
    setSchedWhen("");
    toast.success(res.message);
    void loadSchedules();
  }

  async function cancelSchedule(id: string) {
    setBusyId(id);
    const res = await cancelScheduledStream(id);
    setBusyId(null);
    if ("error" in res) { toast.error(res.error); return; }
    setMine((prev) => prev.filter((r) => r.id !== id));
    toast.success("Schedule cancelled.");
  }

  async function startScheduled(row: Scheduled) {
    setBusyId(row.id);
    if (!cameraOn) await startCamera();
    setBusyId(null);
    void startBroadcast(row);
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

  // The whole room is PRO, not just the red button: a non-member never reaches
  // the camera, the recorder or the scheduler. The server says so first.
  if (!canBroadcast) {
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
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
            style={{ backgroundColor: "var(--border)", color: "var(--text-secondary)" }}>
            <Lock className="w-3.5 h-3.5" /> PRO only
          </span>
        </div>

        <div className="card overflow-hidden">
          <div className="relative aspect-video flex flex-col items-center justify-center gap-4 text-center px-6"
            style={{ background: "linear-gradient(160deg, var(--brand-green), #000)" }}>
            <img src="/crown.png" alt="" width={72} height={72} className="w-[72px] h-[72px]"
              style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))" }} />
            <div className="inline-flex items-center gap-2 text-white/90 text-sm font-semibold">
              <Lock className="w-4 h-4" /> This room is locked
            </div>
            <p className="text-white/70 text-sm max-w-md">
              Live streaming belongs to CONNEXA PRO. Members broadcast straight to their followers,
              read viewer chat as it arrives and schedule a stream ahead of time.
            </p>
          </div>
          <div className="p-5 space-y-4">
            <h2 className="font-bold text-lg text-[var(--text-primary)]">Unlock the live room</h2>
            {broadcastReason && (
              <p className="text-sm pl-3 border-l-2" style={{ borderColor: "var(--brand-gold)", color: "var(--text-secondary)" }}>
                {broadcastReason}
              </p>
            )}
            <ul className="grid sm:grid-cols-2 gap-2 text-sm text-[var(--text-secondary)]">
              {["Broadcast to your followers", "Live viewer chat and reactions", "Schedule a stream in advance", "A highlight reel on your profile cover"].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Radio className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--brand-gold)" }} />
                  {line}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Link href="/pro#upgrade" className="btn-primary inline-flex items-center gap-2"
                style={{ background: "var(--brand-gold)", color: "var(--brand-green)" }}>
                <Crown className="w-4 h-4" /> Upgrade to PRO
              </Link>
              <Link href="/pro" className="btn-ghost inline-flex items-center gap-2">See everything PRO includes</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          <div className={`bg-black flex flex-col sm:flex-row ${screen.active ? "h-full" : live ? "h-[70vh]" : "aspect-video"}`}>
            <div className="relative flex-1 min-h-0">
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
                  {!live && cameraOn && canBroadcast && (
                    <Button variant="danger" onClick={() => void startBroadcast()} icon={<Radio className="w-4 h-4" />}>Start live</Button>
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
            {live && chatSessionId && (
              <LiveChat
                sessionId={chatSessionId}
                active={live}
                currentUserId={profile.id}
                className="h-44 sm:h-auto sm:w-72 flex-shrink-0 border-t sm:border-t-0 sm:border-l border-white/10"
              />
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
              {canBroadcast ? (
                <Button variant="danger" onClick={() => void startBroadcast()} icon={<Radio className="w-4 h-4" />}>Start live session</Button>
              ) : (
                <Link href="/pro#upgrade" className="btn-primary" style={{ background: "var(--brand-gold)", color: "var(--brand-green)" }}>
                  Upgrade to PRO to go live
                </Link>
              )}
              <Button variant="ghost" onClick={flipCamera} icon={<SwitchCamera className="w-4 h-4" />}>Flip</Button>
              <Button variant="ghost" onClick={stopCamera} icon={<VideoOff className="w-4 h-4" />}>Turn off</Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => void stopBroadcast(true)} icon={<Square className="w-4 h-4 fill-current" />}>Stop session</Button>
          )}
        </div>
        {!canBroadcast && broadcastReason && (
          <p className="px-4 pb-4 text-xs font-semibold" style={{ color: "var(--brand-gold-text)" }}>{broadcastReason}</p>
        )}
      </div>

      {canBroadcast && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" style={{ color: "var(--brand-gold)" }} />
            <h2 className="font-bold text-[var(--text-primary)]">Schedule a broadcast</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <input className="input" placeholder="What is the broadcast about?" maxLength={120}
              value={schedTitle} onChange={(e) => setSchedTitle(e.target.value)} />
            <input type="datetime-local" className="input" aria-label="When the broadcast starts"
              value={schedWhen} onChange={(e) => setSchedWhen(e.target.value)} />
          </div>
          <Button onClick={() => void submitSchedule()} loading={scheduling} icon={<Calendar className="w-4 h-4" />}>
            Schedule it
          </Button>
        </div>
      )}

      {(mine.length > 0 || upcoming.length > 0 || scheduleNotice) && (
        <div className="card p-4 space-y-3">
          <h2 className="font-bold text-[var(--text-primary)]">Upcoming broadcasts</h2>
          {scheduleNotice && (
            <p className="text-xs pl-2 border-l-2" style={{ borderColor: "var(--brand-gold)", color: "var(--text-secondary)" }}>
              {scheduleNotice}
            </p>
          )}
          {mine.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg" style={{ backgroundColor: "var(--bg)" }}>
              <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: "var(--brand-gold)" }} />
              <div className="flex-1 min-w-[10rem]">
                <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{s.title || "Untitled broadcast"}</p>
                <p className="text-xs text-[var(--text-secondary)]">{new Date(s.scheduled_at).toLocaleString()} · yours</p>
              </div>
              <Button size="sm" variant="danger" loading={busyId === s.id} icon={<Play className="w-3.5 h-3.5" />}
                onClick={() => void startScheduled(s)}>Start now</Button>
              <Button size="sm" variant="ghost" loading={busyId === s.id} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                onClick={() => void cancelSchedule(s.id)}>Cancel</Button>
            </div>
          ))}
          {upcoming.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg" style={{ backgroundColor: "var(--bg)" }}>
              <Radio className="w-4 h-4 flex-shrink-0 text-[var(--text-secondary)]" />
              <div className="flex-1 min-w-[10rem]">
                <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{s.title || "Untitled broadcast"}</p>
                <p className="text-xs text-[var(--text-secondary)]">{s.host} · {new Date(s.scheduled_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

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
        While you are live your profile cover shows the broadcast to everyone, and viewers can reach you in the
        chat beside the picture. When you stop, the last few seconds stay on your cover as a recent broadcast.
        CONNEXA keeps the full recording in your browser, so you can post it to your feed — no third‑party
        streaming service involved. Your camera never turns on until you press “Turn on camera”.
      </p>
    </div>
  );
}
