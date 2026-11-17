import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { proMediaUrl } from "@/lib/media";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProFrame } from "@/components/pro/ProFrame";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { EventsBoard } from "./EventsBoard";
import { featureEnabled, getProStatus } from "@/lib/pro";
import type { EventCardRow } from "./EventsBoard";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events Hub" };

export default async function EventsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [status, enabled] = await Promise.all([
    getProStatus(supabase, user.id),
    featureEnabled(supabase, "events_hub"),
  ]);

  // A star select keeps working when ends_at/banner_path are not in the database
  // yet; naming a missing column would fail the whole read.
  const { data, error } = await supabase.from("events")
    .select(`*, owner:profiles(id, username, display_name),
             attendees:event_attendees(user_id, response)`)
    .eq("published", true)
    .order("starts_at", { ascending: true })
    .limit(40);
  const probe = await supabase.from("events").select("ends_at, banner_path").limit(1);
  const extrasReady = !probe.error;

  const rows: EventCardRow[] = (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    starts_at: e.starts_at,
    ends_at: e.ends_at ?? null,
    location: e.location,
    category: e.category,
    owner_id: e.owner_id,
    cover_url: proMediaUrl(supabase, e.cover_path),
    banner_path: e.banner_path ?? null,
    banner_url: proMediaUrl(supabase, e.banner_path),
    owner: Array.isArray(e.owner) ? e.owner[0] ?? null : e.owner ?? null,
    attendees: (e.attendees ?? []).map((a) => ({ user_id: a.user_id, response: a.response })),
  }));

  return (
    <AppLayout>
      <ProFrame title="Events Hub" pro={status.pro} expiresAt={status.expiresAt}
        subtitle="Posters, dates and a guest list. Attendance is a real row per person, so the count on an event is the number of people who actually answered.">
        {!enabled && <ProDataNote tone="warn">An administrator has switched the Events Hub off.</ProDataNote>}
        {error && <ProDataNote>The Events Hub opens when migration 031 is pasted in Supabase.</ProDataNote>}
        <EventsBoard
          events={rows as unknown as Parameters<typeof EventsBoard>[0]["events"]}
          currentUserId={user.id}
          canCreate={status.pro && enabled}
          pro={status.pro}
          extrasReady={extrasReady && !error}
        />
      </ProFrame>
    </AppLayout>
  );
}
