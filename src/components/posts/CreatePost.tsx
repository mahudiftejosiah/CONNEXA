"use client";

import { useState, useRef } from "react";
import { ImageIcon, Video, Globe, Users, Lock, X, Mic, Square } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { createPost } from "@/lib/actions/posts";
import type { Profile, PostVisibility } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

interface CreatePostProps {
  profile: Profile;
  onCreated?: () => void;
  groupId?: string;
}

const visibilityOptions: { value: PostVisibility; label: string; icon: React.ReactNode }[] = [
  { value: "public",  label: "Public",   icon: <Globe className="w-3.5 h-3.5" /> },
  { value: "friends", label: "Friends",  icon: <Users className="w-3.5 h-3.5" /> },
  { value: "only_me", label: "Only me",  icon: <Lock className="w-3.5 h-3.5" /> },
];

export function CreatePost({ profile, onCreated, groupId }: CreatePostProps) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<PostVisibility>("public");
  const [previews, setPreviews] = useState<{ file: File; url: string; type: "image" | "video" | "audio" }[]>([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function toggleVoiceRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Microphone access was blocked — allow it in your browser to record.");
      return;
    }
    const recorder = new MediaRecorder(stream);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const ext = blob.type.includes("ogg") ? "ogg" : "webm";
      const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: blob.type });
      setPreviews((p) => [...p, { file, url: URL.createObjectURL(blob), type: "audio" }]);
      setRecSeconds(0);
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setRecSeconds(0);
    timerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).slice(0, 4 - previews.length).map((f) => ({
      file: f,
      url: URL.createObjectURL(f),
      type: (f.type.startsWith("video/") ? "video" : "image") as "image" | "video",
    }));
    setPreviews((p) => [...p, ...next]);
  }

  function removePreview(index: number) {
    setPreviews((p) => {
      URL.revokeObjectURL(p[index].url);
      return p.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() && previews.length === 0) {
      toast.error("Write something or add media.");
      return;
    }
    setLoading(true);
    const fd = new FormData();
    fd.set("content", content);
    fd.set("visibility", visibility);
    if (groupId) fd.set("groupId", groupId);
    previews.forEach((p) => fd.append("media", p.file));

    const res = await createPost(fd);
    setLoading(false);

    if (res.error) { toast.error(res.error); return; }
    toast.success("Post published!");
    setContent("");
    setPreviews([]);
    setExpanded(false);
    onCreated?.();
  }

  return (
    <div className="card p-4">
      <div className="flex gap-3 items-start">
        <Avatar src={profile.avatar_url} name={profile.display_name} size={44} userId={profile.id} />
        <div className="flex-1">
          <textarea
            placeholder={`What's on your mind, ${profile.display_name.split(" ")[0]}?`}
            className={cn(
              "w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--a-800))] transition-all duration-200",
              expanded ? "min-h-[100px]" : "min-h-[44px]"
            )}
            style={{ backgroundColor: "var(--bg)", color: "var(--text-primary)" }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onFocus={() => setExpanded(true)}
            maxLength={5000}
            aria-label="Post content"
          />

          {/* Media previews */}
          {previews.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {previews.map((p, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-[var(--border)]">
                  {p.type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt="Preview" className="w-full h-full object-cover" />
                  ) : p.type === "audio" ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-3 bg-[var(--bg)]">
                      <Mic className="w-8 h-8" style={{ color: "rgb(var(--a-800))" }} />
                      <audio src={p.url} controls className="w-full" />
                    </div>
                  ) : (
                    <video src={p.url} className="w-full h-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => removePreview(i)}
                    className="absolute top-1.5 right-1.5 bg-black/60 rounded-full p-0.5 text-white hover:bg-black/80"
                    aria-label="Remove media"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {expanded && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,video/mp4,video/webm"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-[var(--border)]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <ImageIcon className="w-4 h-4" /> Photo
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-[var(--border)]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <Video className="w-4 h-4" /> Video
                </button>
                <button
                  type="button"
                  onClick={toggleVoiceRecording}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors",
                    recording ? "bg-red-600 text-white hover:bg-red-700" : "hover:bg-[var(--border)]"
                  )}
                  style={recording ? undefined : { color: "var(--text-secondary)" }}
                >
                  {recording ? (
                    <>
                      <Square className="w-4 h-4 fill-current" /> Stop · {Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, "0")}
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" /> Voice
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as PostVisibility)}
                  className="input py-1.5 text-sm w-auto"
                  aria-label="Post visibility"
                >
                  {visibilityOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <Button onClick={handleSubmit} loading={loading} size="sm">Post</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
