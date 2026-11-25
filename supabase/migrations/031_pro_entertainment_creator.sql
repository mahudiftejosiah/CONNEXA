-- ============================================================
-- CONNEXA 031 — CONNEXA PRO: entertainment and creator
--
-- Music corner, live quiz battles, events hub, marketplace,
-- achievement badges, plus the one storage bucket every premium
-- upload shares.
--
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- ============================================================
-- Preflight: this migration relies on CONNEXA's existing core schema.
DO $preflight$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'CONNEXA prerequisite missing: public.profiles table does not exist.';
  END IF;
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'CONNEXA prerequisite missing: public.is_admin() function does not exist.';
  END IF;
END;
$preflight$;

BEGIN;

-- ---------- Music corner ----------
CREATE TABLE IF NOT EXISTS public.music_tracks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  artist      TEXT NOT NULL CHECK (char_length(artist) BETWEEN 1 AND 160),
  genre       TEXT CHECK (genre IS NULL OR char_length(genre) BETWEEN 1 AND 60),
  description TEXT,
  source_url  TEXT,                      -- the legally hosted page it came from
  audio_path  TEXT,                      -- object in the pro-media bucket
  cover_path  TEXT,
  published   BOOLEAN NOT NULL DEFAULT TRUE,
  added_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (audio_path IS NOT NULL OR source_url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_music_tracks_feed ON public.music_tracks(published, created_at DESC);

CREATE TABLE IF NOT EXISTS public.playlists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description TEXT,
  published   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.playlist_tracks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id  UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  track_id     UUID NOT NULL REFERENCES public.music_tracks(id) ON DELETE CASCADE,
  position     INT NOT NULL DEFAULT 0,
  UNIQUE (playlist_id, track_id)
);

ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "music_select" ON public.music_tracks;
CREATE POLICY "music_select" ON public.music_tracks FOR SELECT
  USING (published OR public.is_admin());
DROP POLICY IF EXISTS "music_admin" ON public.music_tracks;
CREATE POLICY "music_admin" ON public.music_tracks FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "playlists_select" ON public.playlists;
CREATE POLICY "playlists_select" ON public.playlists FOR SELECT
  USING (published OR owner_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "playlists_owner" ON public.playlists;
CREATE POLICY "playlists_owner" ON public.playlists FOR ALL
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "playlist_tracks_select" ON public.playlist_tracks;
CREATE POLICY "playlist_tracks_select" ON public.playlist_tracks FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "playlist_tracks_owner" ON public.playlist_tracks;
CREATE POLICY "playlist_tracks_owner" ON public.playlist_tracks FOR ALL
  USING (EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND (p.owner_id = auth.uid() OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND (p.owner_id = auth.uid() OR public.is_admin())));

-- ---------- Live quiz battles ----------
CREATE TABLE IF NOT EXISTS public.quizzes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description  TEXT,
  category     TEXT CHECK (category IS NULL OR char_length(category) BETWEEN 1 AND 60),
  difficulty   TEXT NOT NULL DEFAULT 'mixed' CHECK (difficulty IN ('easy','medium','hard','mixed')),
  time_limit_seconds INT NOT NULL DEFAULT 300 CHECK (time_limit_seconds BETWEEN 30 AND 3600),
  published    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id        UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  prompt         TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 500),
  options        JSONB NOT NULL,           -- ["answer","answer",…]
  position       INT NOT NULL DEFAULT 0,
  CHECK (jsonb_array_length(options) BETWEEN 2 AND 8)
);
-- The right answer lives apart from the question so a player can be handed the
-- question without ever being handed the answer.
CREATE TABLE IF NOT EXISTS public.quiz_answers (
  question_id    UUID PRIMARY KEY REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  correct_index  INT NOT NULL CHECK (correct_index >= 0)
);
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id      UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score        INT NOT NULL CHECK (score >= 0),
  total        INT NOT NULL CHECK (total >= 0),
  seconds_used INT NOT NULL CHECK (seconds_used >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_recent ON public.quiz_attempts(user_id, created_at DESC);

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quizzes_select" ON public.quizzes;
CREATE POLICY "quizzes_select" ON public.quizzes FOR SELECT USING (published OR public.is_admin());
DROP POLICY IF EXISTS "quizzes_admin" ON public.quizzes;
CREATE POLICY "quizzes_admin" ON public.quizzes FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Players see the prompt and the choices.
DROP POLICY IF EXISTS "quiz_questions_select" ON public.quiz_questions;
CREATE POLICY "quiz_questions_select" ON public.quiz_questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND (q.published OR public.is_admin())));
DROP POLICY IF EXISTS "quiz_questions_admin" ON public.quiz_questions;
CREATE POLICY "quiz_questions_admin" ON public.quiz_questions FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- …and only an administrator can read which choice is right.
DROP POLICY IF EXISTS "quiz_answers_select" ON public.quiz_answers;
CREATE POLICY "quiz_answers_select" ON public.quiz_answers FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS "quiz_answers_admin" ON public.quiz_answers;
CREATE POLICY "quiz_answers_admin" ON public.quiz_answers FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Grading happens inside the database, because the browser must never be the
-- one holding the answer key. SECURITY DEFINER lets it read quiz_answers for
-- the single attempt it is scoring, and it writes only for auth.uid().
--
-- The two reader functions below are the only way a player sees a question:
-- prompts and choices out, correct_index never.
CREATE OR REPLACE FUNCTION public.list_open_quizzes()
RETURNS TABLE (id UUID, title TEXT, description TEXT, category TEXT, difficulty TEXT,
               time_limit_seconds INT, questions BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT q.id, q.title, q.description, q.category, q.difficulty, q.time_limit_seconds,
         (SELECT count(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id)
    FROM quizzes q
   WHERE q.published
   ORDER BY q.created_at DESC
   LIMIT 40;
$$;

-- PostgreSQL cannot change a function's OUT/RETURNS TABLE row type with
-- CREATE OR REPLACE. Drop this exact signature first, then recreate it.
DROP FUNCTION IF EXISTS public.open_quiz(UUID);

CREATE FUNCTION public.open_quiz(p_quiz UUID)
RETURNS TABLE (
  id UUID,
  prompt TEXT,
  options JSONB,
  question_position INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT qq.id, qq.prompt, qq.options, qq.position
    FROM public.quiz_questions AS qq
    JOIN public.quizzes AS q ON q.id = qq.quiz_id
   WHERE qq.quiz_id = p_quiz
     AND q.published = TRUE
   ORDER BY qq.position;
$$;

GRANT EXECUTE ON FUNCTION public.list_open_quizzes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_quiz(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.grade_quiz_attempt(
  p_quiz UUID,
  p_answers JSONB,          -- [{"question_id":"uuid","choice":0}, …]
  p_seconds INT DEFAULT 0
) RETURNS TABLE (score INT, total INT, results JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_row RECORD;
  v_pick INT;
  v_score INT := 0;
  v_count INT := 0;
  v_results JSONB := '[]'::jsonb;
  v_limit INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in to play a quiz.';
  END IF;

  SELECT q.time_limit_seconds INTO v_limit FROM public.quizzes q WHERE q.id = p_quiz AND q.published;
  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'That quiz is not open.';
  END IF;

  FOR v_row IN
    SELECT qq.id, qq.position, qa.correct_index
      FROM public.quiz_questions qq
      JOIN public.quiz_answers qa ON qa.question_id = qq.id
     WHERE qq.quiz_id = p_quiz
     ORDER BY qq.position
  LOOP
    v_count := v_count + 1;
    v_pick := NULL;
    BEGIN
      v_pick := (p_answers -> (v_count - 1) ->> 'choice')::int;
    EXCEPTION WHEN OTHERS THEN
      v_pick := NULL;
    END;
    IF v_pick IS NOT NULL AND v_pick = v_row.correct_index THEN
      v_score := v_score + 1;
    END IF;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'question_id', v_row.id,
      'choice', v_pick,
      'correct', v_row.correct_index,
      'right', v_pick = v_row.correct_index
    ));
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'This quiz has no questions yet.';
  END IF;

  -- The clock is allowed a little slack, then the attempt counts as timed out.
  IF p_seconds IS NULL OR p_seconds < 0 THEN
    p_seconds := 0;
  ELSIF p_seconds > v_limit + 30 THEN
    p_seconds := v_limit;
  END IF;

  INSERT INTO public.quiz_attempts (quiz_id, user_id, score, total, seconds_used)
    VALUES (p_quiz, v_user, v_score, v_count, LEAST(p_seconds, v_limit));

  RETURN QUERY SELECT v_score, v_count, v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grade_quiz_attempt(UUID, JSONB, INT) TO authenticated;

DROP POLICY IF EXISTS "quiz_attempts_select" ON public.quiz_attempts;
CREATE POLICY "quiz_attempts_select" ON public.quiz_attempts FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());
-- Rows are written by grade_quiz_attempt, not by a player.
DROP POLICY IF EXISTS "quiz_attempts_own" ON public.quiz_attempts;
CREATE POLICY "quiz_attempts_own" ON public.quiz_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ---------- Events hub ----------
CREATE TABLE IF NOT EXISTS public.events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description  TEXT,
  starts_at    TIMESTAMPTZ NOT NULL,
  location     TEXT CHECK (location IS NULL OR char_length(location) BETWEEN 1 AND 200),
  category     TEXT CHECK (category IS NULL OR char_length(category) BETWEEN 1 AND 60),
  cover_path   TEXT,
  published    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_upcoming ON public.events(published, starts_at);

CREATE TABLE IF NOT EXISTS public.event_attendees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  response    TEXT NOT NULL DEFAULT 'going' CHECK (response IN ('going','maybe','declined')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attendees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select" ON public.events;
CREATE POLICY "events_select" ON public.events FOR SELECT
  USING (published OR owner_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "events_owner" ON public.events;
CREATE POLICY "events_owner" ON public.events FOR ALL
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "event_attendees_select" ON public.event_attendees;
CREATE POLICY "event_attendees_select" ON public.event_attendees FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "event_attendees_own" ON public.event_attendees;
CREATE POLICY "event_attendees_own" ON public.event_attendees FOR ALL
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ---------- Marketplace ----------
CREATE TABLE IF NOT EXISTS public.listings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('product','service')),
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description  TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  price        NUMERIC(14,2) CHECK (price IS NULL OR price >= 0),
  currency     TEXT NOT NULL DEFAULT 'NGN' CHECK (char_length(currency) = 3),
  category     TEXT CHECK (category IS NULL OR char_length(category) BETWEEN 1 AND 60),
  image_paths  TEXT[] NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','removed')),
  reviewed_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  contact      TEXT CHECK (contact IS NULL OR char_length(contact) <= 200),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_listings_browse ON public.listings(status, kind, created_at DESC);

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listings_select" ON public.listings;
CREATE POLICY "listings_select" ON public.listings FOR SELECT
  USING (status = 'approved' OR owner_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "listings_owner" ON public.listings;
CREATE POLICY "listings_owner" ON public.listings FOR ALL
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

-- ---------- Achievement badges ----------
CREATE TABLE IF NOT EXISTS public.badges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 60),
  description    TEXT NOT NULL DEFAULT '',
  icon_path      TEXT,
  condition_key  TEXT NOT NULL CHECK (condition_key IN
                    ('posts','comments','reactions_received','friends','followers','stories','events','quizzes_taken')),
  threshold      INT NOT NULL CHECK (threshold >= 1),
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.user_badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id    UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  awarded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, badge_id)
);

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "badges_select" ON public.badges;
CREATE POLICY "badges_select" ON public.badges FOR SELECT USING (active OR public.is_admin());
DROP POLICY IF EXISTS "badges_admin" ON public.badges;
CREATE POLICY "badges_admin" ON public.badges FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "user_badges_select" ON public.user_badges;
CREATE POLICY "user_badges_select" ON public.user_badges FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "user_badges_award" ON public.user_badges;
CREATE POLICY "user_badges_award" ON public.user_badges FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Badges are earned from the numbers already stored, never handed out by a
-- script in the browser. refresh_user_badges() counts real rows and awards the
-- badges whose threshold they pass; it runs as the person it is scoring.
CREATE OR REPLACE FUNCTION public.user_activity_counts(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  out JSONB;
BEGIN
  SELECT jsonb_build_object(
    'posts', (SELECT count(*) FROM public.posts WHERE author_id = p_user),
    'comments', (SELECT count(*) FROM public.comments WHERE author_id = p_user),
    'reactions_received', (
      SELECT count(*) FROM public.reactions r
        JOIN public.posts po ON po.id = r.post_id
       WHERE po.author_id = p_user
    ),
    'friends', (SELECT count(*) FROM public.friendships WHERE user_id = p_user),
    'followers', (SELECT count(*) FROM public.followers WHERE following_id = p_user),
    'stories', (SELECT count(*) FROM public.stories WHERE author_id = p_user),
    'events', (SELECT count(*) FROM public.events WHERE owner_id = p_user),
    'quizzes_taken', (SELECT count(*) FROM public.quiz_attempts WHERE user_id = p_user)
  ) INTO out;
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_user_badges(p_user UUID DEFAULT auth.uid())
RETURNS TABLE (awarded TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c JSONB;
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'You can only refresh your own badges.';
  END IF;

  c := public.user_activity_counts(p_user);

  INSERT INTO user_badges (user_id, badge_id)
  SELECT p_user, b.id FROM badges b
   WHERE b.active
     AND COALESCE((c ->> b.condition_key)::int, 0) >= b.threshold
  ON CONFLICT (user_id, badge_id) DO NOTHING;

  RETURN QUERY
    SELECT b.name FROM badges b
      JOIN user_badges ub ON ub.badge_id = b.id AND ub.user_id = p_user
     ORDER BY b.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_activity_counts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_user_badges(UUID) TO authenticated;

-- ---------- Premium uploads ----------
-- One bucket for every PRO image and audio file, so the dashboard has a single
-- place to look and no second storage system exists to keep in step.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('pro-media', 'pro-media', TRUE)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "pro_media_read" ON storage.objects;
CREATE POLICY "pro_media_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'pro-media');

DROP POLICY IF EXISTS "pro_media_write" ON storage.objects;
CREATE POLICY "pro_media_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pro-media'
    AND (public.is_admin() OR (storage.foldername(name))[1] = auth.uid()::text)
  );

DROP POLICY IF EXISTS "pro_media_manage" ON storage.objects;
CREATE POLICY "pro_media_manage" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pro-media' AND public.is_admin());

DROP POLICY IF EXISTS "pro_media_remove" ON storage.objects;
CREATE POLICY "pro_media_remove" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pro-media'
    AND (public.is_admin() OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- Starter badges, so the shelf is not empty on day one. Real counts decide who
-- earns them; nothing here hands anybody a badge.
INSERT INTO public.badges (name, description, condition_key, threshold) VALUES
  ('First Words',      'Wrote 10 posts that people read.',            'posts', 10),
  ('Conversationalist','Left 25 comments on other people''s posts.',  'comments', 25),
  ('Appreciated',      'Collected 100 reactions across your posts.',  'reactions_received', 100),
  ('Well Connected',   'Made 25 friends on CONNEXA.',                 'friends', 25),
  ('Widely Followed',  'Grew an audience of 100 followers.',           'followers', 100),
  ('Storyteller',      'Published 20 stories.',                        'stories', 20),
  ('Host',             'Held 3 events in the Events Hub.',             'events', 3),
  ('Quick Thinker',    'Finished 10 quiz battles.',                    'quizzes_taken', 10)
ON CONFLICT (name) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify: expects yes x 8 | 1
SELECT
  (SELECT CASE WHEN to_regclass('public.music_tracks') IS NOT NULL THEN 'yes' ELSE 'no' END) AS tracks,
  (SELECT CASE WHEN to_regclass('public.playlists') IS NOT NULL THEN 'yes' ELSE 'no' END) AS playlists,
  (SELECT CASE WHEN to_regclass('public.quizzes') IS NOT NULL THEN 'yes' ELSE 'no' END) AS quizzes,
  (SELECT CASE WHEN to_regclass('public.quiz_attempts') IS NOT NULL THEN 'yes' ELSE 'no' END) AS attempts,
  (SELECT CASE WHEN to_regclass('public.events') IS NOT NULL THEN 'yes' ELSE 'no' END) AS events,
  (SELECT CASE WHEN to_regclass('public.listings') IS NOT NULL THEN 'yes' ELSE 'no' END) AS listings,
  (SELECT CASE WHEN to_regclass('public.badges') IS NOT NULL THEN 'yes' ELSE 'no' END) AS badges,
  (SELECT CASE WHEN to_regclass('public.user_badges') IS NOT NULL THEN 'yes' ELSE 'no' END) AS awarded,
  (SELECT count(*) FROM storage.buckets WHERE id = 'pro-media') AS bucket;
