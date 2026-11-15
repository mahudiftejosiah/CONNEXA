"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { db, Panel, Notice, Stat } from "./useRows";
import toast from "react-hot-toast";

type StoredFile = {
  name: string;
  id: string;
  updated_at: string | null;
  metadata?: { size?: number } | null;
};

function bytes(n: number | undefined): string {
  const size = n ?? 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
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

// One bucket holds every premium upload (migration 031), so this single view is
// the whole of the PRO storage — no second service to keep track of.
export function ProUploads() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Objects in pro-media" value={files.length} />
        <Stat label="Total size" value={bytes(total)} />
      </div>

      <Panel title="Upload and storage management"
        hint="Every PRO audio file, cover, event poster and badge icon lives here, under the account that uploaded it. Deleting an object frees the space but does not delete the record that points at it — remove the track, event or badge from its own section too.">
        <Notice text={error} />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => void load()}>Refresh</Button>
          <span className="text-xs text-[var(--text-secondary)]">{loading ? "Loading…" : `${files.length} file(s) across every folder`}</span>
        </div>
        {!loading && files.length === 0 && !error && (
          <p className="text-sm text-[var(--text-secondary)]">Nothing has been uploaded yet.</p>
        )}
        <div className="space-y-1.5">
          {files.map((f) => (
            <div key={f.id ?? f.name} className="flex items-center gap-3 text-sm p-2 rounded-lg" style={{ backgroundColor: "var(--bg-main)" }}>
              <HardDrive className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />
              <span className="flex-1 min-w-0 font-mono text-xs truncate">{f.name}</span>
              <span className="text-xs text-[var(--text-secondary)] flex-shrink-0">{bytes(f.metadata?.size)}</span>
              <Button size="sm" variant="ghost" loading={busy === f.name} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                onClick={async () => {
                  setBusy(f.name);
                  const { error: err } = await db().storage.from("pro-media").remove([f.name]);
                  setBusy(null);
                  if (err) { toast.error("Delete failed: " + err.message); return; }
                  setFiles((p) => p.filter((x) => x.name !== f.name));
                  toast.success("File deleted.");
                }}>
                Delete
              </Button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
