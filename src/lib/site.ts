import { createClient } from "@/lib/supabase/server";
import type { SiteContent } from "@/lib/supabase/types";

const VALID_THEMES = ["connexa", "crimson", "ocean", "violet", "amber"];

export async function getGlobalTheme(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("site_settings").select("value").eq("key", "global_theme").maybeSingle();
  return data?.value && VALID_THEMES.includes(data.value) ? data.value : "connexa";
}

export async function getEffectiveTheme(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: prefs } = await supabase
        .from("user_preferences").select("color_theme").eq("user_id", user.id).maybeSingle();
      const t = prefs?.color_theme as string | undefined;
      if (t && t !== "follow_site" && VALID_THEMES.includes(t)) return t;
    }
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
