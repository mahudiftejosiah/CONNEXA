import { AppLayout } from "@/components/layout/AppLayout";
import { createClient } from "@/lib/supabase/server";
import GamesClient from "./GamesClient";

export const metadata = { title: "Games" };

export default async function GamesPage() {
  const supabase = await createClient();
  const { data: games } = await supabase.from("external_games").select("*").order("created_at", { ascending: false });

  return (
    <AppLayout>
      <GamesClient externalGames={(games || []) as any} />
    </AppLayout>
  );
}
