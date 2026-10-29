import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

interface AppLayoutProps {
  children: React.ReactNode;
  rightSidebar?: React.ReactNode;
}

export async function AppLayout({ children, rightSidebar }: AppLayoutProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  let unreadNotifications = 0;
  let unreadMessages = 0;
  let isAdmin = false;

  if (user) {
    const profileRes = await supabase.from("profiles").select("*").eq("id", user.id).single();
    const notifRes = await supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("is_read", false);

    // Get conversation IDs for unread message count
    const cpRes = await supabase.from("conversation_participants").select("conversation_id").eq("user_id", user.id);
    const convIds = cpRes.data?.map((r) => r.conversation_id) ?? [];

    let msgCount = 0;
    if (convIds.length > 0) {
      const msgRes = await supabase.from("messages").select("id", { count: "exact", head: true })
        .neq("sender_id", user.id)
        .eq("is_read", false)
        .in("conversation_id", convIds);
      msgCount = msgRes.count ?? 0;
    }

    profile = profileRes.data;
    unreadNotifications = notifRes.count ?? 0;
    unreadMessages = msgCount;
    isAdmin = profile?.is_admin ?? false;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        profile={profile}
        unreadNotifications={unreadNotifications}
        unreadMessages={unreadMessages}
      />
      <div className="flex flex-1 pt-16">
        {user && (
          <Sidebar
            profile={profile}
            unreadNotifications={unreadNotifications}
            unreadMessages={unreadMessages}
            isAdmin={isAdmin}
          />
        )}
        <main className={`flex-1 ${user ? "md:ml-64" : ""} ${rightSidebar ? "lg:mr-80" : ""}`}>
          <div className="max-w-2xl mx-auto px-4 py-6">
            {children}
          </div>
        </main>
        {rightSidebar && (
          <aside className="hidden lg:block fixed right-0 top-16 bottom-0 w-80 overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-card)] p-4">
            {rightSidebar}
          </aside>
        )}
      </div>
      {user && (
        <MobileNav
          unreadNotifications={unreadNotifications}
          unreadMessages={unreadMessages}
        />
      )}
    </div>
  );
}
