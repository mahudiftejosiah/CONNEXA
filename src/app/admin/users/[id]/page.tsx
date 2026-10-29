import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signPostMedia, signStoryMedia } from "@/lib/media";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminUserClient } from "./AdminUserClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Manage User | Admin" };

export default async function AdminUserPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: adminProfile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!adminProfile?.is_admin) redirect("/feed");

  const { data: target } = await supabase.from("profiles").select("*").eq("id", params.id).single();
  if (!target) notFound();

  const [postsRes, storiesRes, counts] = await Promise.all([
    supabase.from("posts")
      .select("*, author:profiles(*), media:post_media(*)")
      .eq("author_id", target.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("stories")
      .select("*")
      .eq("author_id", target.id)
      .order("created_at", { ascending: false })
      .limit(50),
    Promise.all([
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", target.id),
      supabase.from("comments").select("id", { count: "exact", head: true }).eq("author_id", target.id),
    ]),
  ]);

  const posts = await signPostMedia(supabase, (postsRes.data || []) as any[]);
  const stories = await signStoryMedia(supabase, (storiesRes.data || []) as any[]);

  return (
    <AppLayout>
      <AdminUserClient
        target={target as any}
        posts={posts as any}
        stories={stories as any}
        stats={{
          posts: counts[0].count ?? 0,
          comments: counts[1].count ?? 0,
        }}
        currentAdminId={user.id}
      />
    </AppLayout>
  );
}
