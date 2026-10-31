import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { LiveGameClient } from "./LiveGameClient";
import type { GameRequest } from "@/lib/supabase/types";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Live game" };

const FALLBACK = (id: string) => ({ id, username: "player", display_name: "Player", avatar_url: null });

export default async function LiveGamePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: req } = await supabase.from("game_requests").select("*").eq("id", params.id).single();
  if (!req || (req.challenger_id !== user.id && req.opponent_id !== user.id)) redirect("/games");

  const { data: people } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", [req.challenger_id, req.opponent_id]);
  const byId = new Map((people || []).map((p) => [p.id, p]));

  return (
    <AppLayout>
      <LiveGameClient
        initial={req as GameRequest}
        challenger={(byId.get(req.challenger_id) as any) || FALLBACK(req.challenger_id)}
        opponent={(byId.get(req.opponent_id) as any) || FALLBACK(req.opponent_id)}
        myId={user.id}
      />
    </AppLayout>
  );
}
