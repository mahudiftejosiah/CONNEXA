import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { proMediaUrl } from "@/lib/media";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProFrame } from "@/components/pro/ProFrame";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { MarketBoard } from "./MarketBoard";
import type { MarketListing } from "./MarketBoard";
import { featureEnabled, getProStatus } from "@/lib/pro";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CONNEXA Marketplace" };

export default async function MarketplacePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [status, enabled] = await Promise.all([
    getProStatus(supabase, user.id),
    featureEnabled(supabase, "marketplace"),
  ]);

  const { data, error } = await supabase.from("listings")
    .select(`id, title, description, price, currency, category, kind, status, image_paths, contact, created_at, owner_id,
             owner:profiles(id, username, display_name)`)
    .order("created_at", { ascending: false })
    .limit(60);

  const listings: MarketListing[] = (data ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description,
    price: l.price === null ? null : Number(l.price),
    currency: l.currency,
    category: l.category,
    kind: l.kind,
    status: l.status,
    contact: l.contact,
    created_at: l.created_at,
    owner_id: l.owner_id,
    images: (l.image_paths ?? []).map((p) => proMediaUrl(supabase, p)).filter((u): u is string => !!u),
    owner: Array.isArray(l.owner) ? l.owner[0] ?? null : (l.owner as MarketListing["owner"]) ?? null,
  }));

  return (
    <AppLayout>
      <ProFrame title="CONNEXA Marketplace" pro={status.pro} expiresAt={status.expiresAt}
        subtitle="Products and services from people on CONNEXA. Nothing is shown until an administrator has read it and approved it.">
        {!enabled && <ProDataNote tone="warn">An administrator has switched the Marketplace off.</ProDataNote>}
        {error && <ProDataNote>The Marketplace opens when migration 031 is pasted in Supabase.</ProDataNote>}
        <MarketBoard listings={listings} currentUserId={user.id} canList={status.pro && enabled} />
      </ProFrame>
    </AppLayout>
  );
}
