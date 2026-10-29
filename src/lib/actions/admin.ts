"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PostVisibility } from "@/lib/supabase/types";

type AdminCtx = { supabase: Awaited<ReturnType<typeof createClient>>; adminId: string };

async function requireAdmin(): Promise<AdminCtx | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { error: "Admins only." };
  return { supabase, adminId: user.id };
}

export async function adminUpdatePost(postId: string, content: string, visibility: PostVisibility): Promise<{ error?: string; success?: boolean }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const { supabase, adminId } = ctx;

  const trimmed = content.trim();
  const { data: post } = await supabase.from("posts").select("author_id, is_shared").eq("id", postId).single();
  if (!post) return { error: "Post not found." };
  if (!trimmed && !post.is_shared) return { error: "Invalid content." };
  if (trimmed.length > 5000) return { error: "Content too long." };

  await supabase.from("posts")
    .update({ content: trimmed, visibility, updated_at: new Date().toISOString() })
    .eq("id", postId);
  await supabase.from("moderation_actions").insert({
    admin_id: adminId, target_user_id: post.author_id, entity_id: postId, entity_type: "post",
    action: "admin_edit_post", reason: "Content edited by admin",
  });

  revalidatePath("/feed");
  revalidatePath("/admin");
  return { success: true };
}

export async function adminDeletePost(postId: string): Promise<{ error?: string; success?: boolean }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const { supabase, adminId } = ctx;

  const { data: post } = await supabase.from("posts").select("author_id").eq("id", postId).single();
  if (!post) return { error: "Post not found." };

  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) return { error: "Failed to delete post." };
  await supabase.from("moderation_actions").insert({
    admin_id: adminId, target_user_id: post.author_id, entity_id: postId, entity_type: "post",
    action: "admin_delete_post", reason: "Post removed by admin",
  });

  revalidatePath("/feed");
  revalidatePath("/admin");
  return { success: true };
}

export async function adminDeleteStory(storyId: string): Promise<{ error?: string; success?: boolean }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const { supabase, adminId } = ctx;

  const { data: story } = await supabase.from("stories").select("author_id").eq("id", storyId).single();
  if (!story) return { error: "Story not found." };

  const { error } = await supabase.from("stories").delete().eq("id", storyId);
  if (error) return { error: "Failed to delete story." };
  await supabase.from("moderation_actions").insert({
    admin_id: adminId, target_user_id: story.author_id, entity_id: storyId, entity_type: "story",
    action: "admin_delete_story", reason: "Story removed by admin",
  });

  revalidatePath("/feed");
  revalidatePath("/stories");
  revalidatePath("/admin");
  return { success: true };
}
