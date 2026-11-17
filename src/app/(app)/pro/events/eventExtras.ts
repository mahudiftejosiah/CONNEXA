import { createClient } from "@/lib/supabase/client";

export const EXTRAS_NOTICE = "An end time and a banner need migration 033.";

// ends_at and banner_path arrive with 033. Naming a column the database does not
// have fails the whole statement, so these are written on their own after the
// event exists — never beside the columns every database already has.
export async function saveEventExtras(
  eventId: string,
  endsAt: string | null,
  bannerPath: string | null
): Promise<string | null> {
  const supabase = createClient();
  const probe = await supabase.from("events").select("ends_at, banner_path").limit(1);
  if (probe.error) return EXTRAS_NOTICE;

  const { error } = await supabase.from("events")
    .update({ ends_at: endsAt, banner_path: bannerPath })
    .eq("id", eventId);
  return error ? "Those details could not be saved." : null;
}

// createEvent() returns no id, so the row it just wrote is matched on the host,
// the name and the start time it was given.
export async function saveNewEventExtras(
  ownerId: string,
  title: string,
  startsAt: string,
  endsAt: string | null,
  bannerPath: string | null
): Promise<string | null> {
  const supabase = createClient();
  const probe = await supabase.from("events").select("ends_at, banner_path").limit(1);
  if (probe.error) return EXTRAS_NOTICE;

  const { data, error } = await supabase.from("events")
    .update({ ends_at: endsAt, banner_path: bannerPath })
    .eq("owner_id", ownerId)
    .eq("title", title)
    .eq("starts_at", startsAt)
    .select("id");
  if (error) return "Those details could not be saved.";
  if (!data?.length) return "The event is live, but its end time and banner could not be attached.";
  return null;
}