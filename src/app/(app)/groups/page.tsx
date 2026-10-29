import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppLayout } from "@/components/layout/AppLayout";
import { GroupsClient } from "./GroupsClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Groups" };

export default async function GroupsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [myGroupsRes, publicGroupsRes] = await Promise.all([
    supabase
      .from("group_memberships")
      .select("*, group:groups(*, owner:profiles(*))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("groups")
      .select("*, owner:profiles(*)")
      .eq("visibility", "public")
      .order("member_count", { ascending: false })
      .limit(20),
  ]);

  const myGroupIds = new Set((myGroupsRes.data || []).map((m) => m.group_id));

  return (
    <AppLayout>
      <GroupsClient
        myMemberships={(myGroupsRes.data || []) as any}
        publicGroups={((publicGroupsRes.data || []).filter((g) => !myGroupIds.has(g.id))) as any}
        currentUserId={user.id}
      />
    </AppLayout>
  );
}
