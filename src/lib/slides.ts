import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type FeaturedSlide = Database["public"]["Tables"]["featured_slides"]["Row"];
export type SlideDestination = FeaturedSlide["destination_type"];

export const DESTINATION_LABELS: Record<SlideDestination, string> = {
  none: "No destination",
  internal: "CONNEXA page",
  event: "Event",
  announcement: "Announcement",
  post: "Featured post",
  group: "Public group",
  profile: "User profile",
  external: "External website",
};

export const DESTINATION_TYPES = Object.keys(DESTINATION_LABELS) as SlideDestination[];

// The homepage only ever asks for slides that are published and inside their
// window. RLS enforces the same rule, so a hand-built query cannot leak a
// staged or expired slide either.
export async function getLiveSlides(supabase: SupabaseClient<Database>, limit = 15): Promise<FeaturedSlide[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("featured_slides")
    .select("*")
    .eq("active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order("sort", { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return data as FeaturedSlide[];
}

export type SlideStatus = "live" | "scheduled" | "expired" | "hidden";

export function slideStatus(slide: FeaturedSlide, now = Date.now()): SlideStatus {
  if (!slide.active) return "hidden";
  if (slide.starts_at && new Date(slide.starts_at).getTime() > now) return "scheduled";
  if (slide.ends_at && new Date(slide.ends_at).getTime() <= now) return "expired";
  return "live";
}

export const STATUS_LABELS: Record<SlideStatus, string> = {
  live: "Live now",
  scheduled: "Scheduled",
  expired: "Ended",
  hidden: "Hidden",
};

// A slide is only clickable when it actually has somewhere to go.
export function slideHref(slide: FeaturedSlide): string | null {
  if (slide.destination_type === "none") return null;
  const url = slide.link_url.trim();
  return url.length > 0 ? url : null;
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}