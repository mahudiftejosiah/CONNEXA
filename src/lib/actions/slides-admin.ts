"use server";

import { requireAdmin } from "./admin";
import { revalidateSite } from "@/lib/revalidateSite";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { FeaturedSlide, SlideDestination } from "@/lib/slides";
import { DESTINATION_LABELS } from "@/lib/slides";

// One slideshow backend. The admin Slideshow tab writes through these
// functions and the homepage reads the same rows, so a save is live on the
// next page load without a deployment.

export type SlideInput = {
  id?: string;
  title: string;
  description: string;
  alt: string;
  image_url: string;
  destination_type: SlideDestination;
  link_url: string;
  cta_enabled: boolean;
  cta_text: string;
  active: boolean;
  duration_ms: number;
  starts_at: string | null;
  ends_at: string | null;
};

type SlideRow = Database["public"]["Tables"]["featured_slides"]["Row"];

const MISSING_TABLE = /does not exist|schema cache|42P01/i;

function tableMissing(message: string | undefined): boolean {
  return !!message && MISSING_TABLE.test(message);
}

async function log(
  supabase: SupabaseClient<Database>,
  adminId: string,
  entry: { action: string; entityId?: string; reason: string }
) {
  await supabase.from("moderation_actions").insert({
    admin_id: adminId,
    entity_id: entry.entityId ?? null,
    entity_type: "slide",
    action: entry.action,
    reason: entry.reason,
  });
}

function clean(input: SlideInput): { error: string } | { values: Database["public"]["Tables"]["featured_slides"]["Insert"] } {
  const title = input.title.trim();
  const description = input.description.trim();
  const alt = input.alt.trim();
  const image = input.image_url.trim();
  const type = input.destination_type;
  let link = input.link_url.trim();
  let ctaEnabled = input.cta_enabled;
  let ctaText = input.cta_text.trim();

  if (!image) return { error: "Add an image — upload one or paste its URL." };
  if (!/^https?:\/\//i.test(image) && !image.startsWith("/")) {
    return { error: "The image must be an uploaded file or a full https:// URL." };
  }
  if (title.length > 90) return { error: "Keep the title under 90 characters." };
  if (description.length > 220) return { error: "Keep the description under 220 characters." };
  if (alt.length > 180) return { error: "Keep the alt text under 180 characters." };

  if (!(type in DESTINATION_LABELS)) return { error: "Choose a destination type." };
  if (type === "none") {
    link = "";
    ctaEnabled = false;
    ctaText = "";
  } else {
    if (!link) return { error: "Add the destination URL or CONNEXA page path." };
    if (type === "external") {
      if (!/^https?:\/\//i.test(link)) return { error: "External links must start with http:// or https://." };
    } else if (!link.startsWith("/") || link.startsWith("//")) {
      return { error: "CONNEXA destinations must be a path like /games or /profile/username." };
    }
    if (ctaEnabled && !ctaText) ctaText = "LEARN MORE";
    if (ctaText.length > 32) return { error: "Keep the button text under 32 characters." };
  }

  const duration = Math.round(Number(input.duration_ms));
  if (!Number.isFinite(duration) || duration < 2000 || duration > 60000) {
    return { error: "Slide duration must be between 2 and 60 seconds." };
  }

  const starts = input.starts_at ? new Date(input.starts_at) : null;
  const ends = input.ends_at ? new Date(input.ends_at) : null;
  if (starts && Number.isNaN(starts.getTime())) return { error: "The start date is not valid." };
  if (ends && Number.isNaN(ends.getTime())) return { error: "The end date is not valid." };
  if (starts && ends && ends.getTime() <= starts.getTime()) {
    return { error: "The end date must be after the start date." };
  }

  return {
    values: {
      title,
      description,
      alt,
      image_url: image,
      destination_type: type,
      link_url: link,
      cta_enabled: ctaEnabled,
      cta_text: ctaText,
      active: input.active,
      duration_ms: duration,
      starts_at: starts ? starts.toISOString() : null,
      ends_at: ends ? ends.toISOString() : null,
    },
  };
}

export async function listSlides(): Promise<{ error: string } | { slides: FeaturedSlide[] }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  const { supabase } = ctx;
  const { data, error } = await supabase
    .from("featured_slides")
    .select("*")
    .order("sort", { ascending: true });
  if (error) {
    return { error: tableMissing(error.message) ? "The slideshow table is not in the database yet. Paste migration 036 in the Supabase SQL editor." : "Could not load the slides." };
  }
  return { slides: (data ?? []) as SlideRow[] };
}

export async function saveSlide(input: SlideInput): Promise<{ error: string } | { success: true; id: string }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  const { supabase, adminId } = ctx;

  const parsed = clean(input);
  if ("error" in parsed) return { error: parsed.error };

  if (input.id) {
    const { data, error } = await supabase
      .from("featured_slides")
      .update(parsed.values as Database["public"]["Tables"]["featured_slides"]["Update"])
      .eq("id", input.id)
      .select("id");
    if (error || !data?.length) {
      return { error: tableMissing(error?.message) ? "Paste migration 036 in the Supabase SQL editor first." : "Could not save the slide." };
    }
    await log(supabase, adminId, { action: "update_slide", entityId: input.id, reason: `Slide edited: ${parsed.values.title || "(untitled)"}` });
    revalidateSite();
    return { success: true, id: input.id };
  }

  const { data: top } = await supabase
    .from("featured_slides")
    .select("sort")
    .order("sort", { ascending: false })
    .limit(1);
  const nextSort = ((top?.[0]?.sort as number | undefined) ?? 0) + 10;

  const { data, error } = await supabase
    .from("featured_slides")
    .insert({ ...parsed.values, sort: nextSort })
    .select("id");
  if (error || !data?.length) {
    return { error: tableMissing(error?.message) ? "Paste migration 036 in the Supabase SQL editor first." : "Could not add the slide." };
  }
  const id = data[0].id as string;
  await log(supabase, adminId, { action: "create_slide", entityId: id, reason: `Slide added: ${parsed.values.title || "(untitled)"}` });
  revalidateSite();
  return { success: true, id };
}

export async function setSlideActive(id: string, active: boolean): Promise<{ error: string } | { success: true }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  const { supabase, adminId } = ctx;
  const { data, error } = await supabase
    .from("featured_slides")
    .update({ active })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { error: "Could not update the slide." };
  await log(supabase, adminId, { action: active ? "publish_slide" : "unpublish_slide", entityId: id, reason: active ? "Slide published to the homepage" : "Slide removed from the homepage" });
  revalidateSite();
  return { success: true };
}

export async function deleteSlide(id: string): Promise<{ error: string } | { success: true }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  const { supabase, adminId } = ctx;

  const { data: row } = await supabase.from("featured_slides").select("image_url, title").eq("id", id).single();
  const { error } = await supabase.from("featured_slides").delete().eq("id", id);
  if (error) return { error: "Could not delete the slide." };

  // If the image was uploaded into the shared covers bucket, tidy it up.
  // Remote placeholder images are left alone.
  const url = (row?.image_url as string | undefined) ?? "";
  const marker = "/object/public/covers/";
  const at = url.indexOf(marker);
  if (at >= 0) {
    const path = decodeURIComponent(url.slice(at + marker.length).split("?")[0]);
    await supabase.storage.from("covers").remove([path]).catch(() => {});
  }

  await log(supabase, adminId, { action: "delete_slide", entityId: id, reason: `Slide deleted: ${(row?.title as string | undefined) || "(untitled)"}` });
  revalidateSite();
  return { success: true };
}

export async function reorderSlides(ids: string[]): Promise<{ error: string } | { success: true }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  const { supabase, adminId } = ctx;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) return { error: "Nothing to reorder." };

  const results = await Promise.all(
    ids.map((id, index) =>
      supabase.from("featured_slides").update({ sort: (index + 1) * 10 }).eq("id", id).select("id")
    )
  );
  if (results.some((r) => r.error || !r.data?.length)) return { error: "Could not save the new order." };

  await log(supabase, adminId, { action: "reorder_slides", reason: `Slideshow order changed (${ids.length} slides)` });
  revalidateSite();
  return { success: true };
}