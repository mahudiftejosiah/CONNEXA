import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signPostMedia } from "@/lib/media";
import { AppLayout } from "@/components/layout/AppLayout";
import { GroupDetailClient } from "./GroupDetailClient";
import type { Metadata } from "next";

interface Props { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("groups").select("name").eq("id", id).single();
  return { title: data?.name || "Group" };
}

export default async function GroupDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: group } = await supabase.from("groups").select("*, owner:profiles(*)").eq("id", id).single();
  if (!group) notFound();

  const { data: membership } = await supabase.from("group_memberships").select("*").eq("group_id", id).eq("user_id", user.id).single();

  // Private groups: non-members cannot view
  if (group.visibility === "private" && !membership) {
    return (
      <AppLayout>
        <div className="card p-8 text-center">
          <h1 className="text-xl font-bold mb-2">Private Group</h1>
          <p className="text-[var(--text-secondary)]">You must be a member to view this group.</p>
        </div>
      </AppLayout>
    );
  }

  const { data: rawPosts } = await supabase
    .from("posts")
    .select("*, author:profiles(*), media:post_media(*)")
    .eq("group_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  const posts = await signPostMedia(supabase, rawPosts || []);

  const { data: members } = await supabase
    .from("group_memberships")
    .select("*, profile:profiles(*)")
    .eq("group_id", id)
    .limit(8);

  return (
    <AppLayout>
      <GroupDetailClient
        group={group as any}
        membership={membership}
        posts={(posts || []) as any}
        members={(members || []) as any}
        currentUserId={user.id}
      />
    </AppLayout>
  );
}
