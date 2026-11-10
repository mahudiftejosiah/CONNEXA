"use client";

import { useState, useEffect, useCallback } from "react";
import { Send, Trash2, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CommentSkeleton } from "@/components/ui/Skeleton";
import { createComment, deleteComment } from "@/lib/actions/posts";
import { formatRelativeTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { CommentWithAuthor, Profile } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import Link from "next/link";

interface CommentSectionProps {
  postId: string;
  currentProfile: Profile | null;
}

const PER_PAGE = 10;

export function CommentSection({ postId, currentProfile }: CommentSectionProps) {
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const loadComments = useCallback(async (p: number, reset = false) => {
    setLoading(true);
    const supabase = createClient();
    const from = (p - 1) * PER_PAGE;
    const { data, count } = await supabase
      .from("comments")
      .select("*, author:profiles(*)", { count: "exact" })
      .eq("post_id", postId)
      .is("parent_id", null)
      .order("created_at", { ascending: true })
      .range(from, from + PER_PAGE - 1);

    setLoading(false);
    const items = (data || []) as unknown as CommentWithAuthor[];
    setComments((prev) => reset ? items : [...prev, ...items]);
    setHasMore((count ?? 0) > p * PER_PAGE);
    setPage(p);
  }, [postId]);

  useEffect(() => {
    loadComments(1, true);
  }, [loadComments]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !currentProfile) return;
    setSubmitting(true);
    const res = await createComment(postId, input.trim());
    setSubmitting(false);
    if (res.error) { toast.error(res.error); return; }
    setInput("");
    loadComments(1, true);
  }

  async function handleDelete(commentId: string) {
    const res = await deleteComment(commentId);
    if (res.error) { toast.error(res.error); return; }
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    toast.success("Comment deleted.");
  }

  return (
    <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: "var(--border)" }}>
      {/* Input */}
      {currentProfile && (
        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
          <Avatar src={currentProfile.avatar_url} name={currentProfile.display_name} size={32} userId={currentProfile.id} />
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Write a comment…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2000}
              className="input py-2 text-sm pr-10"
              aria-label="Write a comment"
            />
            <button
              type="submit"
              disabled={!input.trim() || submitting}
              className="absolute right-2 top-1/2 -translate-y-1/2 disabled:opacity-40 transition-opacity"
              style={{ color: "rgb(var(--a-800))" }}
              aria-label="Post comment"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* Comments list */}
      {loading ? (
        <div className="space-y-3">
          <CommentSkeleton />
          <CommentSkeleton />
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <Link href={`/profile/${c.author.username}`}>
                <Avatar src={c.author.avatar_url} name={c.author.display_name} size={32} userId={c.author.id} />
              </Link>
              <div className="flex-1">
                <div className="rounded-xl px-3 py-2" style={{ backgroundColor: "var(--bg)" }}>
                  <Link
                    href={`/profile/${c.author.username}`}
                    className="text-sm font-semibold hover:underline"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {c.author.display_name}
                  </Link>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: "var(--text-primary)" }}>
                    {c.content}
                  </p>
                </div>
                <div className="flex items-center gap-3 mt-1 px-1">
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {formatRelativeTime(c.created_at)}
                  </span>
                  {(currentProfile?.id === c.author_id || currentProfile?.is_admin) && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-xs text-red-500 hover:text-red-600 flex items-center gap-0.5"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <button
          onClick={() => loadComments(page + 1)}
          className="flex items-center gap-1 text-sm hover:underline mx-auto"
          style={{ color: "rgb(var(--a-800))" }}
        >
          <ChevronDown className="w-4 h-4" /> Load more comments
        </button>
      )}

      {!loading && comments.length === 0 && (
        <p className="text-sm text-center py-2" style={{ color: "var(--text-secondary)" }}>
          No comments yet. Be the first!
        </p>
      )}
    </div>
  );
}
