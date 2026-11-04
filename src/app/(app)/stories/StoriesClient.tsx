"use client";

import { useState, useRef } from "react";
import { Plus, X, ChevronLeft, ChevronRight, Eye, Trash2, Upload } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { signStoryMedia } from "@/lib/media";
import type { StoryWithAuthor, Profile } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";

interface StoriesClientProps {
  stories: StoryWithAuthor[];
  profile: Profile;
  currentUserId: string;
}

export function StoriesClient({ stories: initStories, profile, currentUserId }: StoriesClientProps) {
  const [stories, setStories] = useState(initStories);
  const [viewing, setViewing] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const grouped = stories.reduce((acc, story) => {
    const id = story.author_id;
    if (!acc[id]) acc[id] = { author: story.author, stories: [] };
    acc[id].stories.push(story);
    return acc;
  }, {} as Record<string, { author: Profile; stories: StoryWithAuthor[] }>);

  const groups = Object.values(grouped);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function handlePublish() {
    if (!file) return;
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${currentUserId}/story_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("stories").upload(path, file);
    if (uploadError) { toast.error("Upload failed."); setUploading(false); return; }
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
    if (error || !story) { toast.error("Failed to create story."); return; }
    const [signedStory] = await signStoryMedia(supabase, [story]);
    setStories((p) => [signedStory as unknown as StoryWithAuthor, ...p]);
    setCreating(false); setFile(null); setPreview(null); setCaption("");
    toast.success("Story published!");
  }

  async function handleDelete(storyId: string) {
    const supabase = createClient();
    await supabase.from("stories").delete().eq("id", storyId).eq("author_id", currentUserId);
    setStories((p) => p.filter((s) => s.id !== storyId));
    setViewing(null);
    toast.success("Story deleted.");
  }

  async function handleView(storyId: string) {
    const supabase = createClient();
    const { data: already } = await supabase.from("story_views")
      .select("id").eq("story_id", storyId).eq("viewer_id", currentUserId).single();
    if (!already) {
      await supabase.from("story_views").insert({ story_id: storyId, viewer_id: currentUserId });
      setStories((p) => p.map((s) => s.id === storyId ? { ...s, has_viewed: true } : s));
    }
  }

  const viewingStory = viewing !== null ? stories[viewing] : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>Stories</h1>

      {/* Story row */}
      <div className="rail flex gap-3 pb-2">
        {/* Create story button */}
        <button
          onClick={() => setCreating(true)}
          className="flex-shrink-0 flex flex-col items-center gap-1.5 group"
          aria-label="Create story"
        >
          <div className="w-16 h-24 rounded-2xl border-2 border-dashed flex items-center justify-center relative overflow-hidden transition-colors"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "rgb(var(--a-800) / 0.3)" }}>
            {profile.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
            )}
            <div className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgb(var(--a-800))" }}>
              <Plus className="w-4 h-4 text-white" />
            </div>
          </div>
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Your story</span>
        </button>

        {/* Stories */}
        {groups.map((g) => {
          const hasUnviewed = g.stories.some((s) => !s.has_viewed);
          const firstStory = g.stories[0];
          const globalIndex = stories.findIndex((s) => s.id === firstStory.id);
          return (
            <button
              key={g.author.id}
              onClick={() => { setViewing(globalIndex); handleView(firstStory.id); }}
              className="flex-shrink-0 flex flex-col items-center gap-1.5"
            >
              <div className="w-16 h-24 rounded-2xl overflow-hidden relative"
                style={{ outline: `2px solid ${hasUnviewed ? "rgb(var(--a-800))" : "var(--border)"}`, outlineOffset: "2px" }}>
                {firstStory.media_type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={firstStory.media_url} alt={g.author.display_name} className="w-full h-full object-cover" />
                ) : (
                  <video src={firstStory.media_url} className="w-full h-full object-cover" muted />
                )}
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                  <Avatar src={g.author.avatar_url} name={g.author.display_name} size={24} />
                </div>
              </div>
              <span className="text-xs font-medium w-16 truncate text-center" style={{ color: "var(--text-secondary)" }}>
                {g.author.id === currentUserId ? "Your story" : g.author.display_name.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </div>

      {groups.length === 0 && (
        <EmptyState
          icon={<Upload className="w-8 h-8" />}
          title="No active stories"
          description="Stories disappear after 24 hours."
          action={<Button onClick={() => setCreating(true)}>Create story</Button>}
        />
      )}

      {/* Story viewer */}
      {viewingStory && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" role="dialog" aria-label="Story viewer">
          <button onClick={() => setViewing(null)} className="absolute top-4 right-4 text-white z-10 p-2" aria-label="Close">
            <X className="w-6 h-6" />
          </button>
          <button
            onClick={() => setViewing((i) => (i !== null && i > 0 ? i - 1 : null))}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white p-2 hover:bg-white/10 rounded-full"
            aria-label="Previous story"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>

          <div className="relative max-w-sm w-full mx-auto">
            {/* Author info */}
            <div className="absolute top-4 left-4 right-4 z-10 flex items-center gap-3">
              <Link href={`/profile/${viewingStory.author.username}`}>
                <Avatar src={viewingStory.author.avatar_url} name={viewingStory.author.display_name} size={36} />
              </Link>
              <div>
                <p className="text-white font-semibold text-sm">{viewingStory.author.display_name}</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>{formatRelativeTime(viewingStory.created_at)}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {viewingStory.author_id === currentUserId && (
                  <>
                    <span className="text-xs flex items-center gap-1" style={{ color: "rgba(255,255,255,0.7)" }}>
                      <Eye className="w-3.5 h-3.5" /> {viewingStory.view_count}
                    </span>
                    <button onClick={() => handleDelete(viewingStory.id)} className="text-red-400 hover:text-red-300" aria-label="Delete story">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Media */}
            {viewingStory.media_type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewingStory.media_url} alt="Story" className="w-full max-h-[85vh] object-contain" />
            ) : (
              <video src={viewingStory.media_url} controls autoPlay className="w-full max-h-[85vh] object-contain" />
            )}

            {viewingStory.caption && (
              <div className="absolute bottom-6 left-4 right-4 text-center">
                <p className="text-white text-sm rounded-xl px-3 py-2" style={{ background: "rgba(0,0,0,0.4)" }}>
                  {viewingStory.caption}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              const next = viewing !== null ? viewing + 1 : null;
              if (next !== null && next < stories.length) {
                setViewing(next);
                handleView(stories[next].id);
              } else {
                setViewing(null);
              }
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white p-2 hover:bg-white/10 rounded-full"
            aria-label="Next story"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </div>
      )}

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Create story</h2>
              <button onClick={() => { setCreating(false); setFile(null); setPreview(null); }}
                className="p-1 rounded-lg hover:bg-[var(--border)]" aria-label="Close">
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

            <Button onClick={handlePublish} disabled={!file} loading={uploading} className="w-full">
              Publish story
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
