-- ============================================================
-- CONNEXA 029 — CONNEXA PRO foundation
--
-- PRO is the paid verification an account already buys through
-- "Upgrade account", so this adds the three pieces a membership
-- system still needs and nothing else:
--   * pro_features      — the switches an administrator may throw,
--   * profile_visits    — the real footfall behind a PRO dashboard,
--   * post_views        — the real impressions behind "post views".
--
-- Nothing here stores invented numbers; every row is written by an
-- action a user actually performed.
--
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- ============================================================
BEGIN;

-- 1) One row per premium capability. The dashboard edits these, the server
--    reads them, and a disabled key locks everybody — including PRO members.
CREATE TABLE IF NOT EXISTS public.pro_features (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  bucket      TEXT NOT NULL CHECK (bucket IN ('identity','community','entertainment','creator')),
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  sort        INT NOT NULL DEFAULT 0
);

INSERT INTO public.pro_features (key, label, description, bucket, sort) VALUES
  ('pro_id',              'PRO ID and analytics',   'The gold badge plus a private dashboard of your real reach.', 'identity', 10),
  ('daily_questions',     'Daily questions',        'Ask the community something new every day.',                  'community', 20),
  ('confessions',         'Anonymous confessions',  'Say it without signing it, under moderation.',               'community', 30),
  ('polls',               'Community polls',        'Run a vote and watch the bars move.',                        'community', 40),
  ('trending_hashtags',   'Trending hashtags',      'What the whole platform is talking about today.',            'community', 50),
  ('quiz_battles',        'Live quiz battles',      'Timed quizzes in the Study Room, scored against a friend.',  'entertainment', 60),
  ('music_corner',        'Music corner',           'Share songs and playlists from legal sources.',              'entertainment', 70),
  ('live_streaming',      'Live streaming',         'Go live and answer viewers as you broadcast.',               'entertainment', 80),
  ('events_hub',          'Events hub',             'Publish an event, invite people, manage who comes.',         'entertainment', 90),
  ('achievement_badges',  'Achievement badges',     'Rewards for participating, helping and building.',           'creator', 100),
  ('memories',            'Memories',               'Your old posts, brought back on the day they happened.',     'creator', 110),
  ('creator_dashboard',   'Creator dashboard',      'Reach, growth and engagement measured from real activity.',  'creator', 120),
  ('marketplace',         'CONNEXA marketplace',    'List products and services with your own photos.',           'creator', 130)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  bucket = EXCLUDED.bucket,
  sort = EXCLUDED.sort;

ALTER TABLE public.pro_features ENABLE ROW LEVEL SECURITY;

-- Everyone may see which features exist (a locked preview needs the label).
DROP POLICY IF EXISTS "pro_features_select" ON public.pro_features;
CREATE POLICY "pro_features_select" ON public.pro_features FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "pro_features_admin" ON public.pro_features;
CREATE POLICY "pro_features_admin" ON public.pro_features FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 2) Footfall. One row per profile view, never revealing the visitor to the
--    owner beyond a count: the dashboard aggregates, it does not name names.
CREATE TABLE IF NOT EXISTS public.profile_visits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visitor_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  visited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (profile_id IS DISTINCT FROM visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_visits_recent
  ON public.profile_visits(profile_id, visited_at DESC);

ALTER TABLE public.profile_visits ENABLE ROW LEVEL SECURITY;

-- The owner reads their own numbers; anybody signed in may add one. Who looked
-- is recorded only so a visit cannot be counted twice a day, and is never
-- shown back to the owner as a name.
DROP POLICY IF EXISTS "profile_visits_select" ON public.profile_visits;
CREATE POLICY "profile_visits_select" ON public.profile_visits FOR SELECT
  USING (profile_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profile_visits_insert" ON public.profile_visits;
CREATE POLICY "profile_visits_insert" ON public.profile_visits FOR INSERT
  TO authenticated WITH CHECK (visitor_id = auth.uid());

-- 3) Post impressions, written once per post per signed-in viewer per day.
CREATE TABLE IF NOT EXISTS public.post_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  viewer_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_on   DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::date,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, viewer_id, viewed_on)
);

CREATE INDEX IF NOT EXISTS idx_post_views_author ON public.post_views(author_id, viewed_at DESC);

ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_views_select" ON public.post_views;
CREATE POLICY "post_views_select" ON public.post_views FOR SELECT
  USING (author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "post_views_insert" ON public.post_views;
CREATE POLICY "post_views_insert" ON public.post_views FOR INSERT
  TO authenticated WITH CHECK (viewer_id = auth.uid());

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify: expects 13 | yes | yes | yes
SELECT
  (SELECT count(*) FROM public.pro_features) AS features,
  (SELECT CASE WHEN to_regclass('public.profile_visits') IS NOT NULL THEN 'yes' ELSE 'no' END) AS visits_table,
  (SELECT CASE WHEN to_regclass('public.post_views') IS NOT NULL THEN 'yes' ELSE 'no' END) AS views_table,
  (SELECT CASE WHEN count(*) = 8 THEN 'yes' ELSE 'no' END FROM pg_policies
     WHERE tablename IN ('pro_features','profile_visits','post_views')) AS policies;
