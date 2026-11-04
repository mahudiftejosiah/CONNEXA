"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils";
import {
  COOKIE_OPTIONS,
  ROLE_COOKIE,
  VIEW_COOKIE,
  roleCookieValue,
  viewCookieValue,
} from "@/lib/adminCookies";

// An admin browsing the public site is a deliberate, cookie-marked choice.
// The panel itself is always gated by a database check; this only decides
// which half of the product a signed-in admin is looking at.
export async function setAdminViewport(mode: "site" | "admin", redirectTo?: string): Promise<void> {
  const store = cookies();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) redirect("/feed");

  store.set(ROLE_COOKIE, roleCookieValue(user.id, true), COOKIE_OPTIONS);

  if (mode === "site") {
    store.set(VIEW_COOKIE, viewCookieValue(user.id), COOKIE_OPTIONS);
    redirect(safeRedirectPath(redirectTo));
  }

  store.delete({ name: VIEW_COOKIE, ...COOKIE_OPTIONS });
  redirect("/admin");
}

export async function enterPublicSite(): Promise<void> {
  await setAdminViewport("site");
}

export async function enterPublicSiteAt(path: string): Promise<void> {
  await setAdminViewport("site", path);
}

export async function backToAdminPanel(): Promise<void> {
  await setAdminViewport("admin");
}

export async function adminSignOut(): Promise<void> {
  const store = cookies();
  const supabase = await createClient();
  await supabase.auth.signOut();
  store.delete({ name: VIEW_COOKIE, ...COOKIE_OPTIONS });
  store.delete({ name: ROLE_COOKIE, ...COOKIE_OPTIONS });
  redirect("/");
}
