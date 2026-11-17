"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, HardDrive, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { db, Panel, Notice, Stat, usePager, Pager, audit } from "./useRows";
import toast from "react-hot-toast";

type StoredFile = {
  name: string;
  id: string;
  updated_at: string | null;
  metadata?: { size?: number; mimetype?: string } | null;
};

function bytes(n: number | undefined): string {
  const size = n ?? 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function kindOf(name: string): "image" | "audio" | "video" | "other" {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].indexOf(ext) >= 0) return "image";
  if (["mp3", "m4a", "ogg", "wav", "flac", "aac", "weba"].indexOf(ext) >= 0) return "audio";
  if (["mp4", "webm", "mov", "m4v"].indexOf(ext) >= 0) return "video";
  return "other";
}

// Objects sit under <uploader>/<folder>/<file>, so a single list only shows the
// top folders. Walk down to the real files and rebuild each full path, which is
// exactly the string the record in the table points at.
async function walk(prefix: string, depth: number): Promise<StoredFile[]> {
  if (depth > 3) return [];
  const { data, error } = await db().storage.from("pro-media").list(prefix, { limit: 1000 });
  if (error) throw new Error(error.message);
  const out: StoredFile[] = [];
  for (const entry of (data ?? []) as unknown as (StoredFile & { id: string | null })[]) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) out.push({ ...entry, name: full });
    else out.push(...await walk(full, depth + 1));
  }
  return out;
}

function fileUrl(path: string): string {
  return db().storage.from("pro-media").getPublicUrl(path).data.publicUrl;
}

// One bucket holds every premium upload (migration 031), so this single view is
// the whole of the PRO storage — no second service to keep track of.
export function ProUploads({ adminId }: { adminId: string }) {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const walked = await walk("", 0);
      setError(null);
      setFiles(walked);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(/Bucket not found/i.test(message)
        ? "The pro-media bucket does not exist yet — paste migration 031."
        : message);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const total = files.reduce((sum, f) => sum + (f.metadata?.size ?? 0), 0);
  const folders = Array.from(new Set(files.map((f) => f.name.split("/").slice(0, 2).join("/")))).sort();
  const term = search.trim().toLowerCase();
  const shown = files.filter((f) =>
    (!folder || f.name.indexOf(folder + "/") === 0) && (!term || f.name.toLowerCase().includes(term)));
  const paged = usePager(shown, 20);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Objects in pro-media" value={files.length} />
        <Stat label="Total size" value={bytes(total)} />
        <Stat label="Images" value={files.filter((f) => kindOf(f.name) === "image").length} />
        <Stat label="Audio and video" value={files.filter((f) => kindOf(f.name) === "audio" || kindOf(f.name) === "video").length} />
      </div>

      <Panel title="Upload and storage management"
        hint="Every PRO audio file, cover, event poster and badge icon lives here, under the account that uploaded it. Preview plays or shows the object before you decide about it. Deleting an object frees the space but does not delete the record that points at it — remove the track, event or badge from its own section too.">
        <Notice text={error} />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => void load()}>Refresh</Button>
          <span className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input className="input pl-9" placeholder="Search file paths…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </span>
          <select className="input text-sm w-auto" value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">Every folder</option>
            {folders.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">{loading ? "Loading…" : `${shown.length} of ${files.length} file(s)`}</p>
        {!loading && files.length === 0 && !error && (
          <p className="text-sm text-[var(--text-secondary)]">Nothing has been uploaded yet.</p>
        )}
        {!loading && files.length > 0 && shown.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">No file matches that search.</p>
        )}
        <div className="space-y-1.5">
          {paged.shown.map((f) => {
            const kind = kindOf(f.name);
            const url = fileUrl(f.name);
            return (
              <div key={f.id ?? f.name} className="rounded-lg" style={{ backgroundColor: "var(--bg-main)" }}>
                <div className="flex items-center gap-3 text-sm p-2">
                  <HardDrive className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />
                  <span className="flex-1 min-w-0 font-mono text-xs truncate">{f.name}</span>
                  <span className="text-xs text-[var(--text-secondary)] flex-shrink-0">{bytes(f.metadata?.size)}</span>
                  {kind !== "other" && (
                    <Button size="sm" variant="ghost" icon={<Eye className="w-3.5 h-3.5" />}
                      onClick={() => setPreview(preview === f.name ? null : f.name)}>
                      {preview === f.name ? "Hide" : "Preview"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" loading={busy === f.name} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                    onClick={async () => {
                      if (!confirm(`Delete ${f.name}? Anything still pointing at it will show a broken file.`)) return;
                      setBusy(f.name);
                      const { error: err } = await db().storage.from("pro-media").remove([f.name]);
                      setBusy(null);
                      if (err) { toast.error("Delete failed: " + err.message); return; }
                      setFiles((p) => p.filter((x) => x.name !== f.name));
                      if (preview === f.name) setPreview(null);
                      void audit(adminId, { entityType: "storage_object", action: "delete_upload", reason: f.name });
                      toast.success("File deleted.");
                    }}>
                    Delete
                  </Button>
                </div>
                {preview === f.name && (
                  <div className="px-2 pb-2 space-y-1.5">
                    {kind === "image" && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={f.name} className="max-h-64 rounded-lg object-contain" style={{ backgroundColor: "var(--bg-card)" }} />
                    )}
                    {kind === "audio" && <audio controls src={url} className="w-full" />}
                    {kind === "video" && <video controls src={url} className="w-full max-h-64 rounded-lg" />}
                    <a href={url} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "var(--brand-gold-text)" }}>
                      Open the original object
                    </a>
                  </div>
                )}
              </div>
            );
          })}
          <Pager page={paged.page} pages={paged.pages} total={paged.total} goTo={paged.goTo} singular="file" />
        </div>
      </Panel>
    </div>
  );
}