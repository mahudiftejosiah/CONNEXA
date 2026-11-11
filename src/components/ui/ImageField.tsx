"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isValidImageType, MAX_IMAGE_SIZE } from "@/lib/utils";
import toast from "react-hot-toast";

interface ImageFieldProps {
  value: string;
  onChange: (next: string) => void;
  userId: string;
  placeholder?: string;
  className?: string;
  // Some panels (the Study Room) style their own inputs.
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
  buttonClassName?: string;
}

// A link box that also accepts a file from the device, so a picture can come
// from the admin's own folder and not only from a URL they found elsewhere.
export function ImageField({
  value, onChange, userId, placeholder, className,
  inputClassName = "input flex-1 min-w-0", inputStyle, buttonClassName,
}: ImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(f: File | null) {
    if (!f) return;
    if (!isValidImageType(f.type)) { toast.error("Choose a JPEG, PNG or WebP image."); return; }
    if (f.size > MAX_IMAGE_SIZE) { toast.error("Image must be under 10 MB."); return; }
    setBusy(true);
    const supabase = createClient();
    const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/thumb_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("covers").upload(path, f, { contentType: f.type, upsert: true });
    setBusy(false);
    if (error) { toast.error("Upload failed."); return; }
    onChange(supabase.storage.from("covers").getPublicUrl(path).data.publicUrl);
    toast.success("Image uploaded.");
  }

  return (
    <div className={`flex gap-2 ${className || ""}`}>
      <input
        className={inputClassName}
        style={inputStyle}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { void upload(e.target.files?.[0] ?? null); e.target.value = ""; }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={`px-3 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 flex-shrink-0 ${buttonClassName || ""}`}
        aria-label="Upload an image from your device"
        title="Upload an image from your device"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
      </button>
    </div>
  );
}
