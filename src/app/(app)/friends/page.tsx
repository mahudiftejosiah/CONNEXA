import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { FriendsClient } from "./FriendsClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Friends" };

export default async function FriendsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [friendsRes, sentRes, receivedRes] = await Promise.all([
    supabase
      .from("friendships")
      .select("friend_id, created_at, friend:profiles!friendships_friend_id_fkey(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("friend_requests")
      .select("*, receiver:profiles!friend_requests_receiver_id_fkey(*)")
      .eq("sender_id", user.id)
      .eq("status", "pending"),
    supabase
      .from("friend_requests")
      .select("*, sender:profiles!friend_requests_sender_id_fkey(*)")
      .eq("receiver_id", user.id)
      .eq("status", "pending"),
  ]);

  return (
    <AppLayout>
      <FriendsClient
        friends={(friendsRes.data || []) as any}
        sentRequests={(sentRes.data || []) as any}
        receivedRequests={(receivedRes.data || []) as any}
        currentUserId={user.id}
      />
    </AppLayout>
  );
}
