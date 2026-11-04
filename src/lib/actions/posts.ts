"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostVisibility } from "@/lib/supabase/types";
import { isValidImageType, isValidVideoType, isValidAudioType, MAX_IMAGE_SIZE, MAX_VIDEO_SIZE, MAX_AUDIO_SIZE } from "@/lib/utils";

export async function createPost(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const content = (formData.get("content") as string)?.trim() || "";
  const visibility = (formData.get("visibility") as PostVisibility) || "public";
  const files = formData.getAll("media") as File[];
  const groupId = formData.get("groupId") as string | null;

  if (files.length === 0 && !content) {
    return { error: "Write something or add media." };
  }
  if (content.length > 5000) {
    return { error: "Post content must be under 5000 characters." };
  }
  if (!["public", "friends", "only_me"].includes(visibility)) {
    return { error: "Invalid visibility setting." };
  }

  // Create post
  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({ author_id: user.id, content, visibility, group_id: groupId || null })
    .select()
    .single();

  if (postError || !post) return { error: "Failed to create post." };

  // Handle media uploads
  const mediaInserts: { post_id: string; url: string; type: "image" | "video" | "audio"; position: number }[] = [];
  for (const file of files) {
    if (!file.size) continue;
    const isImage = isValidImageType(file.type);
    const isVideo = isValidVideoType(file.type);
    const isAudio = isValidAudioType(file.type);
    if (!isImage && !isVideo && !isAudio) continue;
    if (isImage && file.size > MAX_IMAGE_SIZE) continue;
    if (isVideo && file.size > MAX_VIDEO_SIZE) continue;
    if (isAudio && file.size > MAX_AUDIO_SIZE) continue;

    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${user.id}/${post.id}_${Date.now()}.${ext}`;
    const { data: upload } = await supabase.storage.from("post-media").upload(path, file, { upsert: false, contentType: file.type });
    if (upload) {
      mediaInserts.push({ post_id: post.id, url: path, type: isImage ? "image" : isVideo ? "video" : "audio", position: mediaInserts.length });
    }
  }

  if (mediaInserts.length > 0) {
    await supabase.from("post_media").insert(mediaInserts);
  }

  // Assistant bot: returns nothing unless the admin has switched it on.
  await supabase.rpc("bot_inspect", { p_entity_type: "post", p_entity_id: post.id, p_content: content });

  revalidatePath("/feed");
  return { postId: post.id };
}

export async function deletePost(postId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: post } = await supabase.from("posts").select("author_id").eq("id", postId).single();
  if (!post) return { error: "Post not found." };

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (post.author_id !== user.id && !profile?.is_admin) return { error: "Unauthorized" };

  await supabase.from("posts").delete().eq("id", postId);
  revalidatePath("/feed");
  return { success: true };
}

export async function updatePost(postId: string, content: string, visibility: PostVisibility) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 5000) return { error: "Invalid content." };

  const { data: post } = await supabase.from("posts").select("author_id").eq("id", postId).single();
  if (!post || post.author_id !== user.id) return { error: "Unauthorized" };

  await supabase.from("posts").update({ content: trimmed, visibility, updated_at: new Date().toISOString() }).eq("id", postId);
  revalidatePath("/feed");
  return { success: true };
}

export async function toggleReaction(postId: string, type: string = "like") {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: existing } = await supabase
    .from("reactions").select("id, type").eq("user_id", user.id).eq("post_id", postId).single();

  if (existing) {
    if (existing.type === type) {
      await supabase.from("reactions").delete().eq("id", existing.id);
      return { action: "removed" };
    } else {
      await supabase.from("reactions").update({ type }).eq("id", existing.id);
      return { action: "changed", type };
    }
  } else {
    await supabase.from("reactions").insert({ user_id: user.id, post_id: postId, type });
    return { action: "added", type };
  }
}

export async function toggleSavePost(postId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: existing } = await supabase
    .from("saved_posts").select("id").eq("user_id", user.id).eq("post_id", postId).single();

  if (existing) {
    await supabase.from("saved_posts").delete().eq("id", existing.id);
    return { saved: false };
  } else {
    await supabase.from("saved_posts").insert({ user_id: user.id, post_id: postId });
    return { saved: true };
  }
}

export async function sharePost(postId: string, content: string, visibility: PostVisibility) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: original } = await supabase.from("posts").select("id, visibility").eq("id", postId).single();
  if (!original) return { error: "Post not found." };
  if (original.visibility === "only_me") return { error: "This post cannot be shared." };

  const { data: post, error } = await supabase.from("posts").insert({
    author_id: user.id,
    content: content.trim() || "",
    visibility,
    is_shared: true,
    shared_post_id: postId,
  }).select().single();

  if (error || !post) return { error: "Failed to share post." };
  revalidatePath("/feed");
  return { postId: post.id };
}

export async function createComment(postId: string, content: string, parentId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 2000) return { error: "Invalid comment." };

  const { data, error } = await supabase.from("comments").insert({
    post_id: postId,
    author_id: user.id,
    content: trimmed,
    parent_id: parentId || null,
  }).select().single();

  if (error) return { error: "Failed to add comment." };

  // Notify post author
  const { data: post } = await supabase.from("posts").select("author_id").eq("id", postId).single();
  if (post && post.author_id !== user.id) {
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
    await supabase.from("notifications").insert({
      user_id: post.author_id,
      actor_id: user.id,
      type: "post_comment",
      entity_id: postId,
      entity_type: "post",
      message: `${profile?.display_name || "Someone"} commented on your post`,
    });
  }

  // Assistant bot: returns nothing unless the admin has switched it on.
  await supabase.rpc("bot_inspect", { p_entity_type: "comment", p_entity_id: data.id, p_content: trimmed });

  revalidatePath("/feed");
  return { comment: data };
}

export async function deleteComment(commentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: comment } = await supabase.from("comments").select("author_id").eq("id", commentId).single();
  if (!comment) return { error: "Not found." };
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (comment.author_id !== user.id && !profile?.is_admin) return { error: "Unauthorized" };

  await supabase.from("comments").delete().eq("id", commentId);
  revalidatePath("/feed");
  return { success: true };
}

export async function reportContent(entityId: string, entityType: "post" | "comment" | "profile" | "group", reason: string, details?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  await supabase.from("content_reports").insert({
    reporter_id: user.id, entity_id: entityId, entity_type: entityType, reason, details: details || null,
  });
  return { success: true };
}
