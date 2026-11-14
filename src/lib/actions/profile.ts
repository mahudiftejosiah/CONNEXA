"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isValidImageType, MAX_IMAGE_SIZE } from "@/lib/utils";
import { placeLine, resolvePlace } from "@/lib/geo";
import type { PostVisibility, ColorTheme } from "@/lib/supabase/types";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const displayName = (formData.get("display_name") as string)?.trim();
  const username = (formData.get("username") as string)?.trim().toLowerCase();
  const bio = (formData.get("bio") as string)?.trim();
  const website = (formData.get("website") as string)?.trim();
  const interestsRaw = (formData.get("interests") as string)?.trim();
  const profileVisibility = formData.get("profile_visibility") as string;

  if (!displayName || displayName.length < 2) return { error: "Display name must be at least 2 characters." };
  if (!username || !/^[a-z0-9_]{3,30}$/.test(username)) return { error: "Username must be 3–30 chars: letters, numbers, underscore." };

  // Check username uniqueness
  const { data: taken } = await supabase.from("profiles")
    .select("id").eq("username", username).neq("id", user.id).single();
  if (taken) return { error: "Username is already taken." };

  const interests = interestsRaw ? interestsRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20) : [];

  // Only a form that carries the picker writes the location, so a caller that
  // knows nothing about places cannot blank one out by omission.
  const sendsPlace = formData.has("country_code");
  const countryCode = ((formData.get("country_code") as string) || "").trim().toUpperCase();
  let place: ReturnType<typeof resolvePlace> = null;
  if (sendsPlace && countryCode) {
    place = resolvePlace({
      country_code: countryCode,
      state_code: ((formData.get("state_code") as string) || "").trim(),
      city: ((formData.get("city") as string) || "").trim(),
    });
    if (!place) return { error: "That place is not in the world list CONNEXA uses. Choose a country from the dropdown." };
  }

  // Migration 026 adds the place columns. Asking for them before that update
  // has been run would fail the whole statement and cost the person their
  // other profile edits, so the columns are checked for first.
  const placeColumns = !sendsPlace
    || !(await supabase.from("profiles").select("country_code").eq("id", user.id).limit(1)).error;

  await supabase.from("profiles").update({
    display_name: displayName,
    username,
    bio: bio || null,
    website: website || null,
    interests,
    profile_visibility: (profileVisibility || "public") as "public" | "friends" | "private",
    ...(sendsPlace && placeColumns
      ? place
        ? {
            region: place.region,
            country: place.country,
            country_code: place.country_code,
            state: place.state,
            city: place.city,
            location: placeLine(place) || null,
          }
        : { region: null, country: null, country_code: null, state: null, city: null, location: null }
      : {}),
  }).eq("id", user.id);

  revalidatePath(`/profile/${username}`);
  revalidatePath("/settings");
  if (sendsPlace && !placeColumns) {
    return { error: "Your profile saved. The location still needs a one-time database update (migration 026) before CONNEXA can store it." };
  }
  return { success: true, username };
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const file = formData.get("avatar") as File;
  if (!file || !file.size) return { error: "No file provided." };
  if (!isValidImageType(file.type)) return { error: "Only JPEG, PNG, or WebP images allowed." };
  if (file.size > MAX_IMAGE_SIZE) return { error: "Image must be under 10 MB." };

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/avatar_${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
  if (error) return { error: "Upload failed." };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);

  revalidatePath("/settings");
  revalidatePath("/profile");
  return { url: data.publicUrl };
}

export async function uploadCover(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const file = formData.get("cover") as File;
  if (!file || !file.size) return { error: "No file provided." };
  if (!isValidImageType(file.type)) return { error: "Only JPEG, PNG, or WebP images allowed." };
  if (file.size > MAX_IMAGE_SIZE) return { error: "Image must be under 10 MB." };

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/cover_${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from("covers").upload(path, file, { upsert: true });
  if (error) return { error: "Upload failed." };

  const { data } = supabase.storage.from("covers").getPublicUrl(path);
  await supabase.from("profiles").update({ cover_url: data.publicUrl }).eq("id", user.id);

  revalidatePath("/settings");
  revalidatePath("/profile");
  return { url: data.publicUrl };
}

export async function updatePreferences(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const bool = (key: string) => formData.get(key) === "true";

  await supabase.from("user_preferences").upsert({
    user_id: user.id,
    theme: ((formData.get("theme") as string) || "system") as "light" | "dark" | "system",
    notify_friend_requests: bool("notify_friend_requests"),
    notify_reactions: bool("notify_reactions"),
    notify_comments: bool("notify_comments"),
    notify_messages: bool("notify_messages"),
    notify_group_activity: bool("notify_group_activity"),
    default_post_visibility: ((formData.get("default_post_visibility") as string) || "public") as PostVisibility,
    color_theme: ((formData.get("color_theme") as string) || "follow_site") as ColorTheme,
  }, { onConflict: "user_id" });

  revalidatePath("/settings");
  return { success: true };
}

export async function requestAccountDeletion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  await supabase.from("moderation_actions").insert({
    admin_id: user.id,
    target_user_id: user.id,
    action: "deletion_requested",
    reason: "User requested account deletion",
  });

  // Client should call signOut() after receiving success
  return { success: true };
}
