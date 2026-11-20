"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { uploadProMediaFile } from "@/lib/media";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { saveEventExtras } from "./eventExtras";

export function EventDetailsEditor({
  eventId,
  initialEndsAt,
  initialBanner,
  onClose,
}: {
  eventId: string;
  initialEndsAt: string;
  initialBanner: { path: string; url: string } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [endsAt, setEndsAt] = useState(initialEndsAt);
  const [banner, setBanner] = useState(initialBanner);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function pick(file: File | null) {
    if (!file) return;
    setUploading(true);
    const res = await uploadProMediaFile(createClient(), file, "events");
    setUploading(false);
    if ("error" in res) { toast.error(res.error); return; }
    setBanner({ path: res.path, url: res.url });
  }

  async function save() {
    const when = endsAt ? new Date(endsAt) : null;
    if (when && Number.isNaN(when.getTime())) { toast.error("Pick an end time that makes sense."); return; }
    setSaving(true);
    const problem = await saveEventExtras(eventId, when ? when.toISOString() : null, banner?.path ?? null);
    setSaving(false);
    if (problem) { setNotice(problem); toast.error(problem); return; }
    toast.success("Event details saved.");
    onClose();
    router.refresh();
  }

  return (
    <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Event details</p>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg border"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }} aria-label="Close details">
          <X className="w-4 h-4" />
        </button>
      </div>

      <label className="block text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
        Ends at (optional)
        <input type="datetime-local" className="input mt-1" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <label className="btn-ghost text-sm border inline-flex items-center gap-2 cursor-pointer" style={{ borderColor: "var(--border)" }}>
          <Upload className="w-4 h-4" />{uploading ? "Uploading…" : banner ? "Change banner" : "Add banner"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
        </label>
        {banner && (
          <button type="button" className="text-xs font-semibold" style={{ color: "#ef4444" }} onClick={() => setBanner(null)}>
            Remove banner
          </button>
        )}
      </div>

      {banner && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={banner.url} alt="" className="w-full h-28 rounded-xl object-cover" />
      )}

      {notice && <ProDataNote tone="warn">{notice}</ProDataNote>}

      <button type="button" className="btn-primary text-sm" disabled={saving || uploading} onClick={() => void save()}>
        Save details
      </button>
    </div>
  );
}