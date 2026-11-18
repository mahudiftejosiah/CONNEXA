"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Eye, Pencil,
  Images, CalendarClock, Clock, Link2, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ImageField } from "@/components/ui/ImageField";
import { FeaturedSlideshow } from "@/components/feed/FeaturedSlideshow";
import { Field, Panel, Notice, Stat, Switch, whenValue } from "./pro/useRows";
import {
  listSlides, saveSlide, setSlideActive, deleteSlide, reorderSlides,
} from "@/lib/actions/slides-admin";
import {
  slideStatus, STATUS_LABELS, DESTINATION_LABELS, DESTINATION_TYPES,
  type FeaturedSlide, type SlideDestination, type SlideStatus,
} from "@/lib/slides";
import toast from "react-hot-toast";

// The homepage slideshow, managed from the existing dashboard. Every write goes
// through the same server actions the homepage reads back, so publishing a slide
// here shows it on the feed on the next page load — no deployment, no second
// admin system. Images upload into the shared `covers` bucket.

type Draft = {
  title: string;
  description: string;
  alt: string;
  image_url: string;
  destination_type: SlideDestination;
  link_url: string;
  cta_enabled: boolean;
  cta_text: string;
  active: boolean;
  seconds: string;
  starts_at: string;
  ends_at: string;
};

const BLANK: Draft = {
  title: "", description: "", alt: "", image_url: "",
  destination_type: "none", link_url: "",
  cta_enabled: false, cta_text: "LEARN MORE",
  active: true, seconds: "6", starts_at: "", ends_at: "",
};

const CTA_IDEAS = ["EXPLORE NOW", "JOIN EVENT", "LEARN MORE", "VIEW POST", "DISCOVER MORE"];

const DEST_HINTS: Record<SlideDestination, string> = {
  none: "This slide stays decorative — tapping it does nothing.",
  internal: "Any CONNEXA page, e.g. /games, /discover or /study.",
  event: "The events hub, e.g. /pro/events.",
  announcement: "Where the announcement lives, e.g. /pro.",
  post: "Where the post appears, e.g. /feed or /profile/username.",
  group: "A public group, e.g. /groups or /groups/<id>.",
  profile: "A member's profile, e.g. /profile/username.",
  external: "A full address starting with https:// — it opens in a new tab.",
};

const DEST_PLACEHOLDERS: Record<SlideDestination, string> = {
  none: "",
  internal: "/games",
  event: "/pro/events",
  announcement: "/pro",
  post: "/feed",
  group: "/groups",
  profile: "/profile/username",
  external: "https://example.com",
};

const STATUS_STYLE: Record<SlideStatus, { bg: string; fg: string }> = {
  live: { bg: "rgb(var(--a-800) / 0.14)", fg: "rgb(var(--a-800))" },
  scheduled: { bg: "rgb(var(--a-800) / 0.10)", fg: "var(--brand-gold-text, #9a7b2f)" },
  expired: { bg: "var(--border)", fg: "var(--text-secondary)" },
  hidden: { bg: "var(--border)", fg: "var(--text-secondary)" },
};

function toDraft(s: FeaturedSlide): Draft {
  return {
    title: s.title,
    description: s.description,
    alt: s.alt,
    image_url: s.image_url,
    destination_type: s.destination_type,
    link_url: s.link_url,
    cta_enabled: s.cta_enabled,
    cta_text: s.cta_text,
    active: s.active,
    seconds: String(Math.round(s.duration_ms / 1000)),
    starts_at: whenValue(s.starts_at),
    ends_at: whenValue(s.ends_at),
  };
}

export function SlidesPanel({ adminId }: { adminId: string }) {
  const [slides, setSlides] = useState<FeaturedSlide[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [preview, setPreview] = useState<FeaturedSlide[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listSlides();
    setLoading(false);
    if ("error" in res) { setError(res.error); setSlides([]); }
    else { setError(null); setSlides(res.slides); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const now = Date.now();
  let liveCount = 0, scheduledCount = 0, offCount = 0;
  slides.forEach((s) => {
    const st = slideStatus(s, now);
    if (st === "live") liveCount++;
    else if (st === "scheduled") scheduledCount++;
    else offCount++;
  });
  const liveSlides = slides.filter((s) => slideStatus(s, now) === "live");

  async function toggleActive(s: FeaturedSlide) {
    setBusy(s.id);
    const res = await setSlideActive(s.id, !s.active);
    setBusy(null);
    if ("error" in res) { toast.error(res.error); return; }
    setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: !s.active } : x)));
    toast.success(!s.active ? "Slide published to the homepage." : "Slide hidden from the homepage.");
  }

  async function remove(id: string) {
    setBusy(id);
    const res = await deleteSlide(id);
    setBusy(null);
    if ("error" in res) { toast.error(res.error); return; }
    setSlides((prev) => prev.filter((x) => x.id !== id));
    setConfirmId(null);
    toast.success("Slide deleted.");
  }

  async function commitOrder(next: FeaturedSlide[]) {
    const prev = slides;
    const renumbered = next.map((s, i) => ({ ...s, sort: (i + 1) * 10 }));
    setSlides(renumbered);
    const res = await reorderSlides(renumbered.map((s) => s.id));
    if ("error" in res) { toast.error(res.error); setSlides(prev); void load(); }
    else toast.success("Display order saved.");
  }

  function move(id: string, dir: -1 | 1) {
    const i = slides.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= slides.length) return;
    const next = slides.slice();
    const [item] = next.splice(i, 1);
    next.splice(j, 0, item);
    void commitOrder(next);
  }

  function dropOn(targetId: string) {
    const source = dragId;
    setDragId(null); setOverId(null);
    if (!source || source === targetId) return;
    const from = slides.findIndex((s) => s.id === source);
    const to = slides.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;
    const next = slides.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    void commitOrder(next);
  }

  async function saveEditor() {
    if (!editor) return;
    const d = editor.draft;
    setSaving(true);
    const res = await saveSlide({
      id: editor.id ?? undefined,
      title: d.title,
      description: d.description,
      alt: d.alt,
      image_url: d.image_url,
      destination_type: d.destination_type,
      link_url: d.link_url,
      cta_enabled: d.cta_enabled,
      cta_text: d.cta_text,
      active: d.active,
      duration_ms: Math.round(Number(d.seconds) * 1000),
      starts_at: d.starts_at,
      ends_at: d.ends_at,
    });
    setSaving(false);
    if ("error" in res) { toast.error(res.error); return; }
    const wasEdit = !!editor.id;
    setEditor(null);
    toast.success(wasEdit ? "Slide saved." : "Slide added to the reel.");
    void load();
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Homepage featured slideshow"
        hint="The premium carousel members see between their Stories and the feed. Publish a slide and it appears on the next page load — no deployment. Drag the rows (or use the arrows) to set the order."
      >
        <div className="flex flex-wrap gap-2">
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setEditor({ id: null, draft: { ...BLANK } })}>
            New slide
          </Button>
          <Button
            variant="outline"
            icon={<Eye className="w-4 h-4" />}
            disabled={liveSlides.length === 0}
            title={liveSlides.length === 0 ? "Publish a slide first to preview the reel" : "Preview the live reel exactly as members see it"}
            onClick={() => setPreview(liveSlides)}
          >
            Preview live reel
          </Button>
        </div>
      </Panel>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Slides in the reel" value={slides.length} />
        <Stat label="Live on the homepage" value={liveCount} />
        <Stat label="Scheduled" value={scheduledCount} />
        <Stat label="Hidden / ended" value={offCount} />
      </div>

      <Notice text={error} />

      <Panel title="All slides" hint="The switch publishes or hides a slide instantly. Preview shows a single slide exactly as it will render.">
        {loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading the reel…</p>
        ) : error ? (
          <p className="text-sm text-[var(--text-secondary)]">Resolve the notice above to manage the reel.</p>
        ) : slides.length === 0 ? (
          <div className="text-sm text-[var(--text-secondary)] space-y-2">
            <p>No slides yet. The homepage hides the slideshow gracefully until you publish one.</p>
            <p>Add your first slide above — upload an image, write a title, choose where it leads, and publish.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {slides.map((s, i) => {
              const st = slideStatus(s, now);
              const style = STATUS_STYLE[st];
              const isOver = overId === s.id && dragId !== s.id;
              return (
                <div
                  key={s.id}
                  draggable
                  onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overId !== s.id) setOverId(s.id); }}
                  onDragLeave={() => { if (overId === s.id) setOverId(null); }}
                  onDrop={(e) => { e.preventDefault(); dropOn(s.id); }}
                  className={`rounded-xl border p-3 flex flex-wrap sm:flex-nowrap items-center gap-3 transition-shadow ${dragId === s.id ? "opacity-50" : ""} ${isOver ? "ring-2 ring-[rgb(var(--a-800))]" : ""}`}
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
                >
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="cursor-grab active:cursor-grabbing text-[var(--text-secondary)]" title="Drag to reorder" aria-hidden="true">
                      <GripVertical className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold tabular-nums w-5 text-center text-[var(--text-secondary)]">{i + 1}</span>
                  </div>

                  <Thumb url={s.image_url} />

                  <div className="flex-1 min-w-[10rem]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-[var(--text-primary)] truncate max-w-[16rem]">
                        {s.title || "(untitled slide)"}
                      </p>
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: style.bg, color: style.fg }}>
                        {STATUS_LABELS[st]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap mt-1 text-[11px] text-[var(--text-secondary)]">
                      <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{Math.round(s.duration_ms / 1000)}s</span>
                      <span className="inline-flex items-center gap-1">
                        {s.destination_type === "external" ? <ExternalLink className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
                        {DESTINATION_LABELS[s.destination_type]}
                        {s.link_url ? ` · ${s.link_url}` : ""}
                      </span>
                      {(s.starts_at || s.ends_at) && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="w-3 h-3" />
                          {s.starts_at ? whenValue(s.starts_at).replace("T", " ") : "now"}
                          {" → "}
                          {s.ends_at ? whenValue(s.ends_at).replace("T", " ") : "open"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                    <Switch on={s.active} onChange={() => void toggleActive(s)} label={s.active ? "Hide this slide" : "Publish this slide"} />
                    <IconBtn label="Preview this slide" onClick={() => setPreview([s])}><Eye className="w-4 h-4" /></IconBtn>
                    <IconBtn label="Edit this slide" onClick={() => setEditor({ id: s.id, draft: toDraft(s) })}><Pencil className="w-4 h-4" /></IconBtn>
                    <IconBtn label="Move up" disabled={i === 0} onClick={() => move(s.id, -1)}><ChevronUp className="w-4 h-4" /></IconBtn>
                    <IconBtn label="Move down" disabled={i === slides.length - 1} onClick={() => move(s.id, 1)}><ChevronDown className="w-4 h-4" /></IconBtn>
                    {confirmId === s.id ? (
                      <>
                        <Button size="sm" variant="danger" loading={busy === s.id} onClick={() => void remove(s.id)}>Delete</Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Keep</Button>
                      </>
                    ) : (
                      <IconBtn label="Delete this slide" danger onClick={() => setConfirmId(s.id)}><Trash2 className="w-4 h-4" /></IconBtn>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Editor — one form for both adding and editing. */}
      <Modal
        open={!!editor}
        onClose={() => { if (!saving) setEditor(null); }}
        title={editor?.id ? "Edit slide" : "New slide"}
        size="xl"
      >
        {editor && (
          <div className="space-y-4">
            <SlideFields
              draft={editor.draft}
              adminId={adminId}
              onChange={(draft) => setEditor({ ...editor, draft })}
            />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button loading={saving} onClick={() => void saveEditor()}>
                {editor.id ? "Save slide" : "Add slide"}
              </Button>
              <Button variant="ghost" disabled={saving} onClick={() => setEditor(null)}>Cancel</Button>
              <span className="text-xs text-[var(--text-secondary)] ml-auto">
                {editor.draft.active ? "Will publish immediately" : "Saved hidden — publish it from the list"}
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* Preview — the real carousel component, so what you see is what ships. */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview && preview.length > 1 ? `Live reel preview · ${preview.length} slides` : "Slide preview"}
        size="xl"
      >
        {preview && (
          <div className="space-y-3">
            <FeaturedSlideshow slides={preview} />
            <p className="text-xs text-[var(--text-secondary)]">
              This is the exact component members see. Hover or use the arrows to move through it; external destinations open in a new tab.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: {
  label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="p-2 rounded-lg border transition-colors disabled:opacity-30 hover:bg-[var(--border)]"
      style={{ borderColor: "var(--border)", color: danger ? "#dc2626" : "var(--text-secondary)" }}
    >
      {children}
    </button>
  );
}

function Thumb({ url }: { url: string }) {
  return (
    <div
      className="relative w-24 aspect-video rounded-lg overflow-hidden flex-shrink-0 border"
      style={{ borderColor: "var(--border)", background: "linear-gradient(135deg, rgb(var(--a-800) / 0.28), rgb(var(--a-800) / 0.06))" }}
    >
      <Images className="absolute inset-0 m-auto w-5 h-5 text-[var(--text-secondary)]" aria-hidden="true" />
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          className="relative w-full h-full object-cover"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
    </div>
  );
}

function SlideFields({ draft, adminId, onChange }: {
  draft: Draft; adminId: string; onChange: (next: Draft) => void;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const clickable = draft.destination_type !== "none";

  return (
    <div className="space-y-4">
      <Field label="Slide image">
        <ImageField
          value={draft.image_url}
          onChange={(image_url) => set({ image_url })}
          userId={adminId}
          placeholder="Upload from your device, or paste an https:// image URL"
        />
      </Field>
      {draft.image_url && (
        <div
          className="relative w-full aspect-video rounded-xl overflow-hidden border"
          style={{ borderColor: "var(--border)", background: "linear-gradient(135deg, rgb(var(--a-800) / 0.28), rgb(var(--a-800) / 0.06))" }}
        >
          <Images className="absolute inset-0 m-auto w-8 h-8 text-[var(--text-secondary)]" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.image_url}
            alt={draft.alt || draft.title || "Slide preview"}
            className="relative w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={`Title (${draft.title.length}/90)`}>
          <input className="input" maxLength={90} value={draft.title} placeholder="Game night, every night"
            onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Alt text (optional, for screen readers)">
          <input className="input" maxLength={180} value={draft.alt} placeholder="Friends gathered around a glowing game board"
            onChange={(e) => set({ alt: e.target.value })} />
        </Field>
      </div>

      <Field label={`Short description (${draft.description.length}/220)`}>
        <textarea className="input min-h-[4rem]" maxLength={220} value={draft.description}
          placeholder="Eleven ways to play — solo puzzles, live chess and friend-versus battles."
          onChange={(e) => set({ description: e.target.value })} />
      </Field>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Destination type">
          <select className="input" value={draft.destination_type}
            onChange={(e) => set({ destination_type: e.target.value as SlideDestination })}>
            {DESTINATION_TYPES.map((t) => <option key={t} value={t}>{DESTINATION_LABELS[t]}</option>)}
          </select>
        </Field>
        <Field label="Display duration (seconds)">
          <input className="input" type="number" min={2} max={60} step={1} value={draft.seconds}
            onChange={(e) => set({ seconds: e.target.value })} />
        </Field>
      </div>

      {clickable && (
        <Field label={draft.destination_type === "external" ? "External website URL" : "CONNEXA destination path"}>
          <input className="input" value={draft.link_url} placeholder={DEST_PLACEHOLDERS[draft.destination_type]}
            onChange={(e) => set({ link_url: e.target.value })} />
          <span className="block text-xs text-[var(--text-secondary)] mt-1">{DEST_HINTS[draft.destination_type]}</span>
        </Field>
      )}
      {!clickable && (
        <p className="text-xs text-[var(--text-secondary)]">{DEST_HINTS.none}</p>
      )}

      {clickable && (
        <div className="rounded-xl p-3 space-y-3" style={{ backgroundColor: "var(--bg-main)" }}>
          <div className="flex items-center gap-2">
            <Switch on={draft.cta_enabled} onChange={(v) => set({ cta_enabled: v })} label="Show a call-to-action button" />
            <span className="text-sm text-[var(--text-secondary)]">
              {draft.cta_enabled ? "Show a call-to-action button on the slide" : "No button — the whole image is still clickable"}
            </span>
          </div>
          {draft.cta_enabled && (
            <Field label="Button text">
              <input className="input" maxLength={32} value={draft.cta_text} placeholder="LEARN MORE"
                onChange={(e) => set({ cta_text: e.target.value })} />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {CTA_IDEAS.map((idea) => (
                  <button key={idea} type="button" onClick={() => set({ cta_text: idea })}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors hover:bg-[var(--border)]"
                    style={{ borderColor: "var(--border)", color: draft.cta_text === idea ? "rgb(var(--a-800))" : "var(--text-secondary)" }}>
                    {idea}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Start showing (optional)">
          <input className="input" type="datetime-local" value={draft.starts_at}
            onChange={(e) => set({ starts_at: e.target.value })} />
        </Field>
        <Field label="Stop showing (optional)">
          <input className="input" type="datetime-local" value={draft.ends_at}
            onChange={(e) => set({ ends_at: e.target.value })} />
        </Field>
      </div>
      <p className="text-xs text-[var(--text-secondary)] -mt-2">
        Leave both empty to show the slide whenever it is published. Set a window to schedule it — members only see it inside those dates.
      </p>

      <div className="flex items-center gap-2">
        <Switch on={draft.active} onChange={(v) => set({ active: v })} label="Published" />
        <span className="text-sm text-[var(--text-secondary)]">
          {draft.active ? "Published — appears on the homepage within its schedule" : "Hidden — kept in the reel but not shown"}
        </span>
      </div>
    </div>
  );
}