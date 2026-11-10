import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { UnreadProvider } from "./UnreadProvider";
import { StoryRingProvider } from "./StoryRingProvider";
import { PresenceHeartbeat } from "./PresenceHeartbeat";
import { getUnreadCounts } from "@/lib/unread-counts";
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
  let isAdmin = false;

  if (user) {
    const [profileRes, counts] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      getUnreadCounts(),
    ]);
    profile = profileRes.data;
    isAdmin = profile?.is_admin ?? false;

    return (
      <UnreadProvider userId={user.id} initial={counts}>
        <StoryRingProvider userId={user.id}>
          <PresenceHeartbeat userId={user.id} />
          <Shell signedIn profile={profile} isAdmin={isAdmin} rightSidebar={rightSidebar}>
            {children}
          </Shell>
        </StoryRingProvider>
      </UnreadProvider>
    );
  }

  return (
    <UnreadProvider userId={null} initial={{ notifications: 0, messages: 0 }}>
      <StoryRingProvider userId={null}>
        <Shell signedIn={false} profile={null} isAdmin={false} rightSidebar={rightSidebar}>
          {children}
        </Shell>
      </StoryRingProvider>
    </UnreadProvider>
  );
}

function Shell({
  signedIn,
  profile,
  isAdmin,
  rightSidebar,
  children,
}: {
  signedIn: boolean;
  profile: Profile | null;
  isAdmin: boolean;
  rightSidebar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar profile={profile} />
      <div className="flex flex-1 pt-16">
        {signedIn && <Sidebar profile={profile} isAdmin={isAdmin} />}
        <main className={`flex-1 ${signedIn ? "md:ml-64" : ""} ${rightSidebar ? "lg:mr-80" : ""}`}>
          <div className="max-w-2xl mx-auto px-4 pt-6 pb-20 md:pb-6">
            {children}
          </div>
        </main>
        {rightSidebar && (
          <aside className="hidden lg:block fixed right-0 top-16 bottom-0 w-80 overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-card)] p-4">
            {rightSidebar}
          </aside>
        )}
      </div>
      {signedIn && <MobileNav username={profile?.username ?? null} />}
    </div>
  );
}
