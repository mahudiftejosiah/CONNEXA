"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  MessageCircle, Share2, Bookmark, BookmarkCheck,
  MoreHorizontal, Trash2, Edit2, Flag, Globe, Users, Lock,
  ThumbsUp, Mic,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CommentSection } from "@/components/posts/CommentSection";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime, cn } from "@/lib/utils";
import { toggleReaction, toggleSavePost, deletePost, sharePost, updatePost, reportContent } from "@/lib/actions/posts";
import type { PostWithAuthor, Profile } from "@/lib/supabase/types";
import toast from "react-hot-toast";

interface PostCardProps {
  post: PostWithAuthor;
  currentUserId?: string;
  commentsExpanded?: boolean;
  onEdit?: (post: PostWithAuthor) => void;
  onComment?: (postId: string) => void;
  onShare?: (post: PostWithAuthor) => void;
  onRefresh?: () => void;
}

const REACTIONS = [
  { type: "like",  emoji: "👍", label: "Like" },
  { type: "love",  emoji: "❤️", label: "Love" },
  { type: "haha",  emoji: "😆", label: "Haha" },
  { type: "wow",   emoji: "😮", label: "Wow" },
  { type: "sad",   emoji: "😢", label: "Sad" },
  { type: "angry", emoji: "😡", label: "Angry" },
];

const reactionMeta = (type: string) => REACTIONS.find((r) => r.type === type) ?? REACTIONS[0];

const visibilityIcon = {
  public:  <Globe className="w-3 h-3" />,
  friends: <Users className="w-3 h-3" />,
  only_me: <Lock className="w-3 h-3" />,
};

export function PostCard({ post, currentUserId, commentsExpanded = false, onEdit, onComment, onShare, onRefresh }: PostCardProps) {
  const [userReaction, setUserReaction] = useState<string | null>(post.user_reaction ?? null);
  const [breakdown, setBreakdown] = useState<Record<string, number>>(
    () => post.reaction_breakdown ?? { like: Math.max(post.reaction_count - (post.user_reaction ? 1 : 0), 0) }
  );
  const [saved, setSaved] = useState(!!post.is_saved);
  const [pickerOpen, setPickerOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState("");
  const [sharing, setSharing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsProfile, setCommentsProfile] = useState<Profile | null>(null);

  const isOwner = currentUserId === post.author_id;
  const totalReactions = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const sortedReactionTypes = Object.entries(breakdown)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
  const previewComments = commentsExpanded ? [] : (post.preview_comments ?? []);

  async function applyReaction(next: string | null) {
    if (!currentUserId) { toast.error("Sign in to react."); return; }
    const prev = userReaction;
    const prevBreakdown = breakdown;
    const nb: Record<string, number> = { ...breakdown };
    if (prev) nb[prev] = Math.max((nb[prev] ?? 1) - 1, 0);
    if (next) nb[next] = (nb[next] ?? 0) + 1;
    setUserReaction(next);
    setBreakdown(nb);
    const res = await toggleReaction(post.id, next ?? prev ?? "like");
    if (res?.error) {
      setUserReaction(prev);
      setBreakdown(prevBreakdown);
      toast.error(res.error);
    }
  }

  function openPickerSoon() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setPickerOpen(true), 200);
  }

  function closePickerSoon() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setPickerOpen(false), 250);
  }

  async function handleSave() {
    if (!currentUserId) { toast.error("Sign in to save."); return; }
    setSaved((p) => !p);
    const res = await toggleSavePost(post.id);
    if (res.error) { setSaved((p) => !p); toast.error(res.error); }
    else toast.success(res.saved ? "Post saved!" : "Removed from saved.");
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await deletePost(post.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (res.error) toast.error(res.error);
    else toast.success("Post deleted.");
  }

  async function handleShare() {
    setSharing(true);
    const res = await sharePost(post.id, shareText, "public");
    setSharing(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Post shared!");
    setShareOpen(false);
    setShareText("");
    onRefresh?.();
  }

  function openEditModal() {
    setEditText(post.content || "");
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!editText.trim()) { toast.error("Post content cannot be empty."); return; }
    setSavingEdit(true);
    const res = await updatePost(post.id, editText, post.visibility);
    setSavingEdit(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Post updated.");
    setEditOpen(false);
    onRefresh?.();
  }

  async function handleReport() {
    if (!reportReason.trim()) { toast.error("Please describe the issue."); return; }
    setReporting(true);
    const res = await reportContent(post.id, "post", reportReason);
    setReporting(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Report submitted. Moderators will review it.");
    setReportOpen(false);
    setReportReason("");
  }

  function openCommentsSection() {
    if (onComment) onComment(post.id); else toggleOwnComments();
  }

  function openCommentsSectionFromSummary() {
    if (commentsExpanded) return;
    openCommentsSection();
  }

  async function toggleOwnComments() {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && !commentsProfile && currentUserId) {
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("*").eq("id", currentUserId).single();
      if (data) setCommentsProfile(data as Profile);
    }
  }

  return (
    <article className="card overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/profile/${post.author.username}`}>
            <Avatar src={post.author.avatar_url} name={post.author.display_name} size={44} />
          </Link>
          <div className="min-w-0">
            <Link href={`/profile/${post.author.username}`} className="font-semibold text-[var(--text-primary)] hover:underline truncate block">
              {post.author.display_name}
            </Link>
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <span>{formatRelativeTime(post.created_at)}</span>
              <span>·</span>
              <span className="flex items-center gap-0.5">{visibilityIcon[post.visibility]}</span>
            </div>
          </div>
        </div>

        {/* Menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="p-1.5 rounded-lg hover:bg-[var(--border)] text-[var(--text-secondary)] transition-colors"
            aria-label="Post options"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-1 w-44 card shadow-lg z-20 py-1 overflow-hidden">
                {isOwner && (
                  <>
                    <button onClick={() => { setMenuOpen(false); if (onEdit) onEdit(post); else openEditModal(); }}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-[var(--border)] text-[var(--text-primary)] transition-colors">
                      <Edit2 className="w-4 h-4" /> Edit post
                    </button>
                    <button onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" /> Delete post
                    </button>
                    <div className="border-t border-[var(--border)] my-1" />
                  </>
                )}
                <button onClick={() => { setMenuOpen(false); setReportOpen(true); }}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-[var(--border)] text-[var(--text-primary)] transition-colors">
                  <Flag className="w-4 h-4" /> Report
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Repost line */}
      {post.reposters && post.reposters.length > 0 && (
        <div className="px-4 pb-2 flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
          <Share2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">
            {post.reposters[0].display_name}
            {post.reposters.length > 1 ? ` and ${post.reposters.length - 1} other${post.reposters.length - 1 > 1 ? "s" : ""}` : ""}
            {" "}reposted
          </span>
        </div>
      )}

      {/* Shared post indicator */}
      {post.is_shared && post.shared_post && (
        <div className="px-4 pb-2 text-sm text-[var(--text-secondary)] flex items-center gap-1">
          <Share2 className="w-3.5 h-3.5" />
          <span>Shared a post</span>
        </div>
      )}

      {/* Content */}
      {post.content && (
        <div className="px-4 pb-3">
          <p className="text-[var(--text-primary)] text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
        </div>
      )}

      {/* Shared original post preview */}
      {post.is_shared && post.shared_post?.author && (
        <div className="mx-4 mb-3 border border-[var(--border)] rounded-xl p-3 bg-[var(--bg)]">
          <div className="flex items-center gap-2 mb-2">
            <Avatar src={post.shared_post.author.avatar_url} name={post.shared_post.author.display_name} size={28} />
            <Link href={`/profile/${post.shared_post.author.username}`} className="text-sm font-semibold hover:underline">
              {post.shared_post.author.display_name}
            </Link>
          </div>
          <p className="text-sm text-[var(--text-secondary)] line-clamp-3">{post.shared_post.content}</p>
        </div>
      )}

      {/* Media */}
      {post.media && post.media.length > 0 && (
        <div className={cn("grid gap-1 mb-1", post.media.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {post.media.slice(0, 4).map((m, i) => (
            <div key={m.id} className="relative aspect-square overflow-hidden bg-[var(--border)]">
              {m.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="Post media" className="w-full h-full object-cover" loading="lazy" />
              ) : m.type === "audio" ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4 bg-[var(--bg)]">
                  <div className="story-ring">
                    <div className="w-16 h-16 rounded-full bg-[var(--bg-card)] flex items-center justify-center">
                      <Mic className="w-7 h-7" style={{ color: "rgb(var(--a-800))" }} />
                    </div>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Voice recording</p>
                  <audio src={m.url} controls className="w-full max-w-xs" />
                </div>
              ) : (
                <video src={m.url} controls className="w-full h-full object-cover" />
              )}
              {i === 3 && post.media.length > 4 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-white text-2xl font-bold">+{post.media.length - 4}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reactions / comments / repost summary */}
      {(totalReactions > 0 || post.comment_count > 0 || post.share_count > 0) && (
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            {sortedReactionTypes.slice(0, 4).map((t) => (
              <span
                key={t}
                title={`${breakdown[t]} ${reactionMeta(t).label}${breakdown[t] > 1 ? "s" : ""}`}
                className="w-[18px] h-[18px] rounded-full bg-[var(--bg-card)] border border-[var(--border)] shadow-sm flex items-center justify-center text-[11px] leading-none"
              >
                {reactionMeta(t).emoji}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[13px] text-[var(--text-secondary)]">
            {totalReactions > 0 && <button onClick={openCommentsSectionFromSummary} className="hover:underline">{totalReactions} reaction{totalReactions > 1 ? "s" : ""}</button>}
            {post.comment_count > 0 && <button onClick={openCommentsSectionFromSummary} className="hover:underline">{post.comment_count} comment{post.comment_count > 1 ? "s" : ""}</button>}
            {post.share_count > 0 && <span>{post.share_count} repost{post.share_count > 1 ? "s" : ""}</span>}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-1 flex items-center justify-between border-t border-[var(--border)]">
        <div className="flex items-center gap-1">
          <div
            className="relative"
            onMouseEnter={openPickerSoon}
            onMouseLeave={closePickerSoon}
          >
            {pickerOpen && (
              <div className="reaction-picker absolute bottom-full left-0 mb-1 flex gap-1 px-2 py-1.5 rounded-full shadow-xl border border-[var(--border)] bg-[var(--bg-card)] z-20">
                {REACTIONS.map((r, i) => (
                  <button
                    key={r.type}
                    title={r.label}
                    aria-label={r.label}
                    onClick={() => { setPickerOpen(false); applyReaction(r.type); }}
                    className="reaction-pop w-9 h-9 flex items-center justify-center text-2xl rounded-full transition-transform duration-150 hover:scale-125 hover:bg-[var(--border)]"
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    {r.emoji}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => applyReaction(userReaction ? null : "like")}
              onContextMenu={(e) => { e.preventDefault(); setPickerOpen((o) => !o); }}
              onTouchStart={() => {
                if (pressTimer.current) clearTimeout(pressTimer.current);
                pressTimer.current = setTimeout(() => setPickerOpen(true), 350);
              }}
              onTouchEnd={() => { if (pressTimer.current) clearTimeout(pressTimer.current); }}
              onTouchMove={() => { if (pressTimer.current) clearTimeout(pressTimer.current); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 hover:bg-[var(--border)]",
                userReaction ? "text-brand-green-800 dark:text-brand-gold-400" : "text-[var(--text-secondary)]"
              )}
              aria-label={userReaction ? `Remove ${reactionMeta(userReaction).label.toLowerCase()}` : "Like"}
            >
              {userReaction ? (
                <span className="text-[15px] leading-none">{reactionMeta(userReaction).emoji}</span>
              ) : (
                <ThumbsUp className="w-4 h-4" />
              )}
              <span>{userReaction ? reactionMeta(userReaction).label : "Like"}</span>
            </button>
          </div>

          <button
            onClick={openCommentsSection}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Comment</span>
          </button>

          <button
            onClick={() => { if (onShare) onShare(post); else setShareOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span>Repost</span>
          </button>
        </div>

        <button
          onClick={handleSave}
          className={cn(
            "p-2 rounded-xl transition-colors",
            saved ? "text-brand-green-800 dark:text-brand-gold-400" : "text-[var(--text-secondary)] hover:bg-[var(--border)]"
          )}
          aria-label={saved ? "Unsave post" : "Save post"}
        >
          {saved ? <BookmarkCheck className="w-4 h-4 fill-current" /> : <Bookmark className="w-4 h-4" />}
        </button>
      </div>

      {/* Comment previews */}
      {previewComments.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          {previewComments.map((c) => (
            <div key={c.id} className="flex gap-2 items-start">
              <Link href={`/profile/${c.author.username}`} className="flex-shrink-0">
                <Avatar src={c.author.avatar_url} name={c.author.display_name} size={32} />
              </Link>
              <div className="min-w-0">
                <div className="bg-[var(--border)] rounded-2xl px-3 py-2 inline-block max-w-full">
                  <Link href={`/profile/${c.author.username}`} className="text-xs font-semibold text-[var(--text-primary)] hover:underline block">
                    {c.author.display_name}
                  </Link>
                  <p className="text-sm text-[var(--text-primary)] leading-snug whitespace-pre-wrap break-words">{c.content}</p>
                </div>
                <div className="flex items-center gap-3 text-xs mt-0.5 px-2">
                  <span className="text-[var(--text-secondary)]">{formatRelativeTime(c.created_at)}</span>
                  <span className="text-brand-green-800 dark:text-brand-gold-400 font-semibold">Like</span>
                  <span className="text-brand-green-800 dark:text-brand-gold-400 font-semibold">Reply</span>
                </div>
              </div>
            </div>
          ))}
          {post.comment_count > previewComments.length && (
            <button onClick={openCommentsSection} className="text-sm font-semibold text-[var(--text-secondary)] hover:underline pl-1">
              View more comments
            </button>
          )}
        </div>
      )}

      {/* Inline comments (used when parent doesn't manage them) */}
      {commentsOpen && !onComment && (
        <div className="px-4 pb-4 pt-3 border-t border-[var(--border)]">
          <CommentSection postId={post.id} currentProfile={commentsProfile} />
        </div>
      )}

      {/* Share modal */}
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share this post" size="md">
        <p className="text-sm text-[var(--text-secondary)] mb-3 line-clamp-2">{post.content || "Shared a post"}</p>
        <textarea
          value={shareText}
          onChange={(e) => setShareText(e.target.value)}
          placeholder="Say something about this post… (optional)"
          rows={3}
          maxLength={5000}
          className="input resize-none"
        />
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="ghost" size="sm" onClick={() => setShareOpen(false)}>Cancel</Button>
          <Button size="sm" loading={sharing} onClick={handleShare}>Repost</Button>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit post" size="md">
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          rows={4}
          maxLength={5000}
          className="input resize-none"
        />
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button size="sm" loading={savingEdit} onClick={handleEditSave}>Save changes</Button>
        </div>
      </Modal>

      {/* Report modal */}
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Report post" size="md">
        <textarea
          value={reportReason}
          onChange={(e) => setReportReason(e.target.value)}
          placeholder="What's wrong with this post?"
          rows={3}
          maxLength={1000}
          className="input resize-none"
        />
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="ghost" size="sm" onClick={() => setReportOpen(false)}>Cancel</Button>
          <Button variant="danger" size="sm" loading={reporting} onClick={handleReport}>Submit report</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete post"
        message="This will permanently delete your post and all its media. This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </article>
  );
}
