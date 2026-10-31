-- ============================================================
-- CONNEXA 009 — Site content, color themes, external games
-- ============================================================

-- ------------------------------------------------------------
-- 1) Admin-editable site content (Terms, Rules, Privacy, About)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_content (
  key        TEXT PRIMARY KEY CHECK (key IN ('terms','rules','privacy','about')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_content_select ON public.site_content;
CREATE POLICY site_content_select ON public.site_content
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS site_content_admin ON public.site_content;
CREATE POLICY site_content_admin ON public.site_content
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.site_content (key, title, body) VALUES
('terms', 'Terms of Service', $$Welcome to CONNEXA

These terms govern your use of CONNEXA, a social network operated by DMFtech. By creating an account you agree to them.

1. Your account
You must provide accurate information, keep your password confidential, and be responsible for activity under your account. You must be at least 13 years old to use CONNEXA.

2. Your content
You own everything you post. By posting, you grant CONNEXA a worldwide licence to store, display and share that content with the audience you chose (public, friends, or only me). You are responsible for what you publish.

3. Acceptable use
You may not: post unlawful, hateful or harassing content; impersonate others; spam; attempt to break, scan or abuse the service; sell other users' data; or bypass privacy or security controls.

4. Moderation
We may remove content or suspend accounts that violate these terms. Admin decisions can be appealed by contacting us through the Help page.

5. Service changes
We may add, change or remove features. We will do our best to keep the service available but we do not guarantee uninterrupted operation.

6. Termination
You may delete your account at any time from Settings. We may suspend or terminate accounts that abuse the platform.

7. Liability
CONNEXA is provided as is, without warranties to the fullest extent permitted by law. DMFtech is not liable for indirect or consequential damages arising from your use of the service.

8. Contact
Questions about these terms? Reach us through the Help & Support page.

These terms were last updated by the CONNEXA admin team.$$),

('rules', 'Community Rules', $$Community Rules

CONNEXA is built around real connections. These rules keep it a place people feel safe sharing in.

Be real
- Use a name that reflects who you are.
- Do not impersonate people, pages or organisations.

Be kind
- No hate speech, bullying or harassment against individuals or groups.
- No threats of violence or encouraging self-harm.
- Disagree respectfully; report, do not retaliate.

Be safe
- No nudity or sexual content. Nothing that exploits anyone.
- Do not share private information about other people without their consent.

Keep it clean
- No spam, scams, or misleading information.
- No selling of accounts, follower manipulation or engagement bait.
- Content that is edited to mislead may be labelled or removed.

Respect the platform
- Do not attempt to access other users' data, exploit vulnerabilities, or automate the service without permission.
- Report bugs and policy violations to the moderation team instead of exploiting or ignoring them.

Consequences
Content that breaks these rules can be removed, and repeat or serious violations lead to suspension or a ban. Admin decisions can be appealed through the Help page.

When you see a rule being broken, use the Report action on the post, comment or profile. Moderation is everyone's job.$$),

('privacy', 'Privacy Policy', $$Privacy Policy

This policy explains what CONNEXA (operated by DMFtech) collects and why.

What we collect
- Account data: name, email, username, password hash (handled by our authentication provider), profile picture and bio you choose to add.
- Content you post: text, images, video and the comments and reactions they receive.
- Usage data: approximate device and connection information used for security and debugging.

How we use it
- To operate the service: showing your posts to the audience you chose, delivering notifications and messages.
- To keep it safe: moderation, spam detection and enforcing our Community Rules.
- To improve it: aggregate statistics about feature usage. We do not sell your personal data.

Your choices
- Privacy settings: control who sees your profile and future posts (public, friends, only me).
- Blocking: blocked users cannot see your content or contact you.
- Data: you can edit or delete your content at any time. Account deletion removes your profile, posts and messages.

Storage and security
- Data is stored with managed database and storage providers under our control, with access restricted by row-level security policies.
- Media is served through signed, expiring URLs rather than permanent public links.
- Never share your password; CONNEXA staff will never ask for it.

Children
CONNEXA is not directed at children under 13.

Contact
For privacy questions or data requests, use the contact options on the Help page.$$),

('about', 'About CONNEXA', $$About CONNEXA

CONNEXA is a social network for meaningful connection: share moments with friends, discover communities around your interests, play games, watch reels and stay in touch through messages — all in one place.

What makes CONNEXA different
- Your audience, your call: every post can be public, friends-only or private to you.
- Communities and groups built around interests, not just follower counts.
- Built-in games and reels so hanging out does not require leaving the app.
- Privacy-first media: your photos and videos are served through signed, expiring links.
- A moderation stack designed for a small team: reports, audit logs and admin tools.

Powered by DMFtech
CONNEXA is designed and operated as a DMFtech project. Our mission is to prove that a small, careful team can build a social platform that respects the people who use it.

The name
CONNEXA comes from connection — the thing every part of this product exists to create.$$)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 2) Color themes
-- ------------------------------------------------------------
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS color_theme TEXT NOT NULL DEFAULT 'follow_site'
  CHECK (color_theme IN ('follow_site','connexa','crimson','ocean','violet','amber'));

CREATE TABLE IF NOT EXISTS public.site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_settings_select ON public.site_settings;
CREATE POLICY site_settings_select ON public.site_settings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS site_settings_admin ON public.site_settings;
CREATE POLICY site_settings_admin ON public.site_settings
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.site_settings (key, value)
VALUES ('global_theme', 'connexa')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 3) External games added by admins
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_games (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  description TEXT,
  play_url    TEXT NOT NULL CHECK (play_url ~ '^https?://'),
  cover_url   TEXT CHECK (cover_url IS NULL OR cover_url ~ '^https?://'),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.external_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS games_select ON public.external_games;
CREATE POLICY games_select ON public.external_games
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS games_admin ON public.external_games;
CREATE POLICY games_admin ON public.external_games
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Keep updated_at fresh on admin edits
DROP TRIGGER IF EXISTS site_content_updated_at ON public.site_content;
CREATE TRIGGER site_content_updated_at BEFORE UPDATE ON public.site_content
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS site_settings_updated_at ON public.site_settings;
CREATE TRIGGER site_settings_updated_at BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
