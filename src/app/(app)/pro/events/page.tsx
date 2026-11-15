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

  const { data, error } = await supabase.from("events")
    .select(`id, title, description, starts_at, location, category, cover_path, owner_id,
             owner:profiles(id, username, display_name),
             attendees:event_attendees(user_id, response)`)
    .eq("published", true)
    .order("starts_at", { ascending: true })
    .limit(40);

  const rows: EventCardRow[] = (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    starts_at: e.starts_at,
    location: e.location,
    category: e.category,
    owner_id: e.owner_id,
    cover_url: proMediaUrl(supabase, e.cover_path),
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
        />
      </ProFrame>
    </AppLayout>
  );
}
