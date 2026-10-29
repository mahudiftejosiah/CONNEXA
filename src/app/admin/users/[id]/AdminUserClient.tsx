"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, Edit2, Eye, Ban } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { adminUpdatePost, adminDeletePost, adminDeleteStory } from "@/lib/actions/admin";
import { formatRelativeTime } from "@/lib/utils";
import type { Profile, PostWithAuthor, PostVisibility } from "@/lib/supabase/types";
import toast from "react-hot-toast";

interface AdminUserClientProps {
  target: Profile;
  posts: PostWithAuthor[];
  stories: any[];
  stats: { posts: number; comments: number };
  currentAdminId: string;
}

export function AdminUserClient({ target, posts, stories, stats, currentAdminId }: AdminUserClientProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editVis, setEditVis] = useState<PostVisibility>("public");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmPost, setConfirmPost] = useState<string | null>(null);
  const [confirmStory, setConfirmStory] = useState<string | null>(null);

  function startEdit(p: PostWithAuthor) {
    setEditingId(p.id);
    setEditText(p.content || "");
    setEditVis(p.visibility);
  }

  async function saveEdit(postId: string) {
    setBusyId(postId);
    const res = await adminUpdatePost(postId, editText, editVis);
    setBusyId(null);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Post updated.");
    setEditingId(null);
    router.refresh();
  }

  async function deletePost(postId: string) {
    setBusyId(postId);
    const res = await adminDeletePost(postId);
    setBusyId(null);
    setConfirmPost(null);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Post deleted.");
    router.refresh();
  }

  async function deleteStory(storyId: string) {
    setBusyId(storyId);
    const res = await adminDeleteStory(storyId);
    setBusyId(null);
    setConfirmStory(null);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Story deleted.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <ArrowLeft className="w-4 h-4" /> Back to admin
      </Link>

      {/* Profile header */}
      <div className="card p-5">
        <div className="flex items-start gap-4">
          <Avatar src={target.avatar_url} name={target.display_name} size={64} />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-[var(--text-primary)] truncate">{target.display_name}</h1>
            <p className="text-sm text-[var(--text-secondary)]">@{target.username} · Joined {formatRelativeTime(target.created_at)}</p>
            {target.bio && <p className="text-sm text-[var(--text-primary)] mt-2">{target.bio}</p>}
            <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-[var(--text-secondary)]">
              <span className="font-semibold">{stats.posts} posts</span>
              <span className="font-semibold">{stats.comments} comments</span>
              <span>{stories.length} stories</span>
              {target.is_admin && <span className="bg-brand-gold-400/20 text-brand-green-800 dark:text-brand-gold-400 px-2 py-0.5 rounded font-medium">Admin</span>}
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <Link href={`/profile/${target.username}`} className="btn-ghost text-sm flex items-center gap-1.5 justify-center">
              <Eye className="w-4 h-4" /> Public view
            </Link>
            {target.id !== currentAdminId && (
              <Link href={`/profile/${target.username}`} className="btn-ghost text-sm flex items-center gap-1.5 justify-center text-red-500">
                <Ban className="w-4 h-4" /> Flag / Ban
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-3">
        <h2 className="font-semibold text-[var(--text-primary)] px-1">Posts ({posts.length})</h2>
        {posts.length === 0 && (
          <div className="card p-6 text-center text-sm text-[var(--text-secondary)]">This user has no posts.</div>
        )}
        {posts.map((p) => (
          <div key={p.id} className="card p-4">
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-2">
              <span>{formatRelativeTime(p.created_at)}</span>
              <span>·</span>
              <span className="font-mono bg-[var(--border)] px-1.5 py-0.5 rounded">{p.visibility}</span>
              <span>·</span>
              <span>{p.reaction_count} likes · {p.comment_count} comments</span>
            </div>

            {editingId === p.id ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  maxLength={5000}
                  className="input resize-none"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select value={editVis} onChange={(e) => setEditVis(e.target.value as PostVisibility)} className="input w-auto py-1 text-sm">
                    <option value="public">Public</option>
                    <option value="friends">Friends</option>
                    <option value="only_me">Only me</option>
                  </select>
                  <Button size="sm" loading={busyId === p.id} onClick={() => saveEdit(p.id)}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                {p.is_shared ? <span className="italic text-[var(--text-secondary)]">Repost{p.content ? ` — ${p.content}` : ""}</span> : (p.content || <span className="italic text-[var(--text-secondary)]">(media only)</span>)}
              </p>
            )}

            {p.media && p.media.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                {p.media.slice(0, 4).map((m) => (
                  <div key={m.id} className="aspect-square rounded-lg overflow-hidden bg-[var(--border)]">
                    {m.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt="Post media" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <video src={m.url} muted className="w-full h-full object-cover" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {editingId !== p.id && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" icon={<Edit2 className="w-3.5 h-3.5" />} onClick={() => startEdit(p)}>Edit</Button>
                <Button size="sm" variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setConfirmPost(p.id)}>Delete</Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stories */}
      <div className="space-y-3">
        <h2 className="font-semibold text-[var(--text-primary)] px-1">Stories ({stories.length})</h2>
        {stories.length === 0 && (
          <div className="card p-6 text-center text-sm text-[var(--text-secondary)]">This user has no stories.</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {stories.map((s) => (
            <div key={s.id} className="card p-3 flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-[var(--border)] flex-shrink-0">
                {s.media_type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.media_url} alt="Story" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <video src={s.media_url} muted className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate text-[var(--text-primary)]">{s.caption || "(no caption)"}</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {formatRelativeTime(s.created_at)} · {s.view_count} views ·{" "}
                  {new Date(s.expires_at) > new Date() ? "active" : "expired"}
                </p>
              </div>
              <Button size="sm" variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setConfirmStory(s.id)}>
                Delete
              </Button>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmPost}
        onClose={() => setConfirmPost(null)}
        onConfirm={() => confirmPost && deletePost(confirmPost)}
        title="Delete post"
        message="Permanently delete this user's post and its media? This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={busyId === confirmPost}
      />
      <ConfirmDialog
        open={!!confirmStory}
        onClose={() => setConfirmStory(null)}
        onConfirm={() => confirmStory && deleteStory(confirmStory)}
        title="Delete story"
        message="Permanently delete this story? This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={busyId === confirmStory}
      />
    </div>
  );
}
