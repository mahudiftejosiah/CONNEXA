import { createClient } from "@/lib/supabase/server";
import type { SiteContent } from "@/lib/supabase/types";

const VALID_THEMES = ["connexa", "crimson", "ocean", "violet", "amber"];

export async function getGlobalTheme(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("site_settings").select("value").eq("key", "global_theme").maybeSingle();
  return data?.value && VALID_THEMES.includes(data.value) ? data.value : "connexa";
}

/**
 * Everyone reads the theme the admin set for the site. Per-user colour themes
 * are no longer honoured: a reader who picked one years ago would otherwise
 * keep a colour they have no way left to change.
 */
export async function getEffectiveTheme(): Promise<string> {
  try {
    return await getGlobalTheme();
  } catch {
    return "connexa";
  }
}

export async function getSiteContentMap(): Promise<Record<string, SiteContent>> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("site_content").select("*");
    const map: Record<string, SiteContent> = {};
    (data || []).forEach((c) => { map[c.key] = c; });
    return map;
  } catch {
    return {};
  }
}
