"use client";

import { useEffect, useRef, useState } from "react";
import { X, Upload, Camera, Image as ImageIcon, Type, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { refreshStoryRings } from "@/components/layout/StoryRingProvider";
import { signStoryMedia } from "@/lib/media";
import type { StoryWithAuthor } from "@/lib/supabase/types";
import { MAX_STORY_SIZE, bytesToMB, isValidImageType, isValidVideoType } from "@/lib/utils";
import toast from "react-hot-toast";

interface CreateStoryProps {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  // The caller owns the story list, so it decides what to do with the new row.
  onPublished?: (story: StoryWithAuthor) => void;
}

type TextPosition = "top" | "center" | "bottom";
type TextSize = "sm" | "md" | "lg";

const TEXT_COLORS: { value: string; label: string }[] = [
  { value: "#FFFFFF", label: "White" },
  { value: "#D6B875", label: "Gold" },
  { value: "#111827", label: "Ink" },
];

const STORY_SECONDS = 24 * 60 * 60;

/**
 * The story composer.
 *
 * It opens where the person is — no page to travel to — and takes the whole
 * screen so the media can be seen at the size it will be published at.
 */
export function CreateStory({ open, onClose, currentUserId, onPublished }: CreateStoryProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [position, setPosition] = useState<TextPosition>("bottom");
  const [color, setColor] = useState("#FFFFFF");
  const [size, setSize] = useState<TextSize>("md");
  const [audience, setAudience] = useState<"public" | "friends">("public");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // A reopened composer should never show the last attempt still sitting there.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setText("");
    setPosition("bottom");
    setColor("#FFFFFF");
    setSize("md");
    setAudience("public");
    setUploading(false);
    setProgress(0);
    setDone(false);
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return null;
    });
  }, [open]);

  // Escape closes the composer, and the page behind it must not scroll.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !uploading) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, uploading]);

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    if (!isValidImageType(f.type) && !isValidVideoType(f.type)) {
      toast.error("Stories can be a photo or a video.");
      return;
    }
    if (f.size > MAX_STORY_SIZE) {
      toast.error(`That file is ${bytesToMB(f.size)}. Stories can be up to ${bytesToMB(MAX_STORY_SIZE)}.`);
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    pickFile(e.target.files?.[0]);
    e.target.value = "";
  }

  /**
   * Sends the file to storage and reports how far it has got. The browser
   * upload is used because it is the only way to show real progress; if the
   * request cannot be made the plain storage call is used instead.
   */
  async function uploadToStorage(path: string, media: File): Promise<{ ok: boolean; error?: string }> {
    const supabase = createClient();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!url || !anonKey || !token) {
      const { error } = await supabase.storage.from("stories").upload(path, media);
      return error ? { ok: false, error: error.message } : { ok: true };
    }

    return new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        const encoded = path.split("/").map(encodeURIComponent).join("/");
        xhr.open("POST", `${url}/storage/v1/object/stories/${encoded}`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("apikey", anonKey);
        xhr.setRequestHeader("Content-Type", media.type || "application/octet-stream");
        xhr.setRequestHeader("x-upsert", "false");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true });
          else resolve({ ok: false, error: `Upload failed (${xhr.status}).` });
        };
        xhr.onerror = () => resolve({ ok: false, error: "The upload lost its connection." });
        xhr.send(media);
      } catch {
        resolve({ ok: false, error: "The upload could not be started." });
      }
    });
  }

  async function publish() {
    if (!file || uploading) return;
    setUploading(true);
    setProgress(0);

    const supabase = createClient();
    const ext = (file.name.split(".").pop() || (file.type.startsWith("video/") ? "mp4" : "jpg"))
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${currentUserId}/story_${Date.now()}.${ext}`;

    const uploaded = await uploadToStorage(path, file);
    if (!uploaded.ok) {
      setUploading(false);
      toast.error(uploaded.error || "Upload failed.");
      return;
    }
    setProgress(100);

    const mediaType: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
    // The expiry is worked out from the moment of publication, so the story
    // lives exactly 24 hours from the moment it was shared.
    const publishedAt = new Date();
    const expiresAt = new Date(publishedAt.getTime() + STORY_SECONDS * 1000).toISOString();

    const payload = {
      author_id: currentUserId,
      media_url: path,
      media_type: mediaType,
      caption: text.trim() || null,
      expires_at: expiresAt,
      published_at: publishedAt.toISOString(),
      audience,
      overlay_position: position,
      overlay_color: color,
      overlay_size: size,
    };

    const { data, error } = await supabase
      .from("stories")
      .insert(payload)
      .select("*, author:profiles(*)")
      .single();

    let created = data as unknown as StoryWithAuthor | null;

    if (error || !created) {
      // A database that has not taken migration 039 yet rejects the new
      // columns. The story itself is still publishable, so it goes out
      // without the extras and the person is told what is missing.
      const missingColumn = /column|audience|overlay|published_at/i.test(error?.message || "");
      if (!missingColumn) {
        setUploading(false);
        toast.error(error?.message || "Failed to create story.");
        return;
      }
      const { data: plain, error: plainError } = await supabase
        .from("stories")
        .insert({
          author_id: currentUserId,
          media_url: path,
          media_type: mediaType,
          caption: text.trim() || null,
          expires_at: expiresAt,
        })
        .select("*, author:profiles(*)")
        .single();
      if (plainError || !plain) {
        setUploading(false);
        toast.error(plainError?.message || error?.message || "Failed to create story.");
        return;
      }
      created = plain as unknown as StoryWithAuthor;
      toast("Story published. Text styling needs migration 039.", { icon: "⚠️" });
    }

    const [signed] = await signStoryMedia(supabase, [created]);
    setUploading(false);
    setDone(true);
    onPublished?.(signed as unknown as StoryWithAuthor);
    refreshStoryRings();
    toast.success("Story published!");

    // A short confirmation, then the composer gets out of the way.
    window.setTimeout(() => {
      setDone(false);
      onClose();
    }, 900);
  }

  if (!open) return null;

  const isVideo = file?.type.startsWith("video/");
  const fontClass =
    size === "sm" ? "text-sm font-medium" : size === "lg" ? "text-2xl font-extrabold" : "text-lg font-bold";
  const place =
    position === "top"
      ? "top-24"
      : position === "center"
        ? "top-1/2 -translate-y-1/2"
        : "bottom-40";

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Create story">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0">
        <button
          onClick={() => { if (!uploading) onClose(); }}
          disabled={uploading}
          className="flex items-center gap-1.5 text-white/90 text-sm font-semibold disabled:opacity-40"
        >
          <X className="w-5 h-5" /> Cancel
        </button>
        <h2 className="text-white font-bold text-base flex-1 text-center">New story</h2>
        <div className="w-16" />
      </div>

      {done ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <span className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "#D6B875" }}>
            <Check className="w-8 h-8 text-black" />
          </span>
          <p className="text-white font-semibold">Your story is live</p>
        </div>
      ) : !file ? (
        /* Step one: choose or capture the media */
        <div className="flex-1 flex items-center justify-center px-6 pb-24">
          <div
            className="w-full max-w-md rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-4 px-6 py-16 text-center"
            style={{ borderColor: "rgba(255,255,255,0.25)" }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pickFile(e.dataTransfer.files?.[0]);
            }}
          >
            <span className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.1)" }}>
              <Upload className="w-7 h-7 text-white/80" />
            </span>
            <div>
              <p className="text-white font-bold text-lg">Add to your story</p>
              <p className="text-white/60 text-sm mt-1">Drop a photo or a video here</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
              <button
                onClick={() => cameraRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-sm text-black"
                style={{ background: "#D6B875" }}
              >
                <Camera className="w-4 h-4" /> Camera
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-sm text-white border border-white/25"
              >
                <ImageIcon className="w-4 h-4" /> Gallery
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Step two: preview, caption and publish */
        <>
          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            {isVideo ? (
              <video src={preview ?? ""} className="w-full h-full object-contain" muted playsInline autoPlay loop />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview ?? ""} alt="Preview" className="w-full h-full object-contain" />
            )}

            {text.trim() && (
              <div className={`absolute left-0 right-0 px-8 text-center pointer-events-none ${place}`}>
                <p
                  className={`inline-block ${fontClass} px-3 py-1.5 rounded-xl`}
                  style={{ color, textShadow: "0 1px 10px rgba(0,0,0,0.65)" }}
                >
                  {text.trim()}
                </p>
              </div>
            )}

            <button
              onClick={() => { setFile(null); setPreview((p) => { if (p) URL.revokeObjectURL(p); return null; }); }}
              className="absolute top-2 right-3 w-9 h-9 rounded-full flex items-center justify-center bg-black/50 text-white"
              aria-label="Choose a different file"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="shrink-0 px-4 pb-6 pt-3 space-y-3">
            {/* Caption and its styling */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2 bg-white/10">
                <Type className="w-4 h-4 text-white/70 flex-shrink-0" />
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Add text… (optional)"
                  maxLength={200}
                  className="flex-1 bg-transparent text-white text-sm placeholder-white/50 outline-none"
                  aria-label="Story text"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {(["top", "center", "bottom"] as TextPosition[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPosition(p)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                      position === p ? "text-black" : "text-white/80 bg-white/10"
                    }`}
                    style={position === p ? { background: "#D6B875" } : undefined}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setColor(c.value)}
                    aria-label={c.label}
                    className={`w-6 h-6 rounded-full border-2 ${color === c.value ? "border-white" : "border-white/30"}`}
                    style={{ background: c.value }}
                  />
                ))}
              </div>

              <div className="flex items-center gap-1">
                {(["sm", "md", "lg"] as TextSize[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-bold uppercase ${
                      size === s ? "text-black" : "text-white/80 bg-white/10"
                    }`}
                    style={size === s ? { background: "#D6B875" } : undefined}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value === "friends" ? "friends" : "public")}
                className="bg-white/10 text-white text-xs rounded-lg px-2 py-2 outline-none"
                aria-label="Who can see this story"
              >
                <option value="public" className="text-black">Everyone</option>
                <option value="friends" className="text-black">Friends only</option>
              </select>

              <button
                onClick={() => void publish()}
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold text-sm text-black disabled:opacity-60"
                style={{ background: "#D6B875" }}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Sharing… {progress}%
                  </>
                ) : (
                  "Share Story"
                )}
              </button>
            </div>

            {uploading && (
              <div className="h-1.5 w-full rounded-full overflow-hidden bg-white/15">
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: "#D6B875" }} />
              </div>
            )}
          </div>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
