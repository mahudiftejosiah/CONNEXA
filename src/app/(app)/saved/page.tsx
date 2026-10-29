import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signPostMedia } from "@/lib/media";
import { attachSharedPosts } from "@/lib/shared-posts";
import { AppLayout } from "@/components/layout/AppLayout";
import { PostCard } from "@/components/posts/PostCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Bookmark } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Saved Posts" };

export default async function SavedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: saved } = await supabase
    .from("saved_posts")
    .select(`
      *,
      post:posts(
        *,
        author:profiles(*),
        media:post_media(*)
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const savedPosts: any[] = (saved || []).map((s) => (s as any).post).filter(Boolean);
  const posts = await signPostMedia(supabase, await attachSharedPosts(supabase, savedPosts
    .map((p) => ({ ...p, is_saved: true }))));

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Saved Posts</h1>

        {posts.length === 0 ? (
          <EmptyState
            icon={<Bookmark className="w-8 h-8" />}
            title="No saved posts"
            description="Posts you save will appear here. Only you can see this collection."
            action={<Link href="/feed" className="btn-primary">Browse your feed</Link>}
          />
        ) : (
          posts.map((post: any) => (
            <PostCard key={post.id} post={post} currentUserId={user.id} />
          ))
        )}
      </div>
    </AppLayout>
  );
}
