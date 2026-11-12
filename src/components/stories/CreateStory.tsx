"use client";

import { useState, useRef, useEffect } from "react";
import { X, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { refreshStoryRings } from "@/components/layout/StoryRingProvider";
import { signStoryMedia } from "@/lib/media";
import type { StoryWithAuthor } from "@/lib/supabase/types";
import toast from "react-hot-toast";

interface CreateStoryProps {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  // The caller owns the story list, so it decides what to do with the new row.
  onPublished?: (story: StoryWithAuthor) => void;
}

// A story is a storage file plus a row that expires in 24 hours. This used to
// live inside the stories page, which meant the only way to add one was to
// navigate there first.
export function CreateStory({ open, onClose, currentUserId, onPublished }: CreateStoryProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // A reopened dialog should never show the last attempt still sitting there.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setCaption("");
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return null;
    });
  }, [open]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function publish() {
    if (!file || uploading) return;
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${currentUserId}/story_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("stories").upload(path, file);
    if (uploadError) {
      setUploading(false);
      toast.error("Upload failed.");
      return;
    }
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const mediaType = file.type.startsWith("video/") ? "video" : "image";
    const { data: story, error } = await supabase.from("stories").insert({
      author_id: currentUserId,
      media_url: path,
      media_type: mediaType,
      caption: caption.trim() || null,
      expires_at: expiresAt,
    }).select("*, author:profiles(*)").single();
    setUploading(false);
    if (error || !story) {
      toast.error("Failed to create story.");
      return;
    }
    const [signed] = await signStoryMedia(supabase, [story]);
    onPublished?.(signed as unknown as StoryWithAuthor);
    refreshStoryRings();
    toast.success("Story published!");
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="card w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Create story</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--border)]" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {preview ? (
          <div className="relative h-64 rounded-xl overflow-hidden bg-black">
            {file?.type.startsWith("video/") ? (
              <video src={preview} controls className="w-full h-full object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Preview" className="w-full h-full object-contain" />
            )}
            <button onClick={() => { setFile(null); setPreview(null); }}
              className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-white" aria-label="Remove">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            className="w-full h-40 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors"
            style={{ borderColor: "var(--border)" }}>
            <Upload className="w-8 h-8" style={{ color: "var(--text-secondary)" }} />
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Click to upload photo or video</p>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm" className="hidden" onChange={handleFileSelect} />

        <input
          type="text"
          placeholder="Add a caption… (optional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={500}
          className="input text-sm"
          aria-label="Caption"
        />

        <Button onClick={publish} disabled={!file} loading={uploading} className="w-full">
          Publish story
        </Button>
      </div>
    </div>
  );
}
