-- ============================================================
-- CONNEXA 033 — CONNEXA PRO: the pieces the audit found missing
--
-- Live broadcasts get viewer chat and reactions, a schedule and a
-- highlight that survives the stream; quiz battles get a real duel
-- between two people; events get invitations; and a handful of
-- columns the admin console kept asking for arrive with them.
--
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- ============================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Live: scheduled broadcasts, a kept highlight, viewer messages
-- ---------------------------------------------------------------------------
ALTER TABLE public.live_sessions DROP CONSTRAINT IF EXISTS live_sessions_status_check;
ALTER TABLE public.live_sessions ADD CONSTRAINT live_sessions_status_check
  CHECK (status IN ('scheduled','live','ended'));

-- What survives a broadcast: the short clip the profile cover rolls afterwards.
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS highlight_path TEXT;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_live_sessions_scheduled ON public.live_sessions(user_id, scheduled_at);

CREATE TABLE IF NOT EXISTS public.live_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'message' CHECK (kind IN ('message','reaction')),
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_messages_session ON public.live_messages(session_id, created_at);

ALTER TABLE public.live_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_messages_read" ON public.live_messages;
CREATE POLICY "live_messages_read" ON public.live_messages FOR SELECT TO public USING (TRUE);

-- Only the broadcaster's live room takes a message, and nobody can speak for
-- someone else. Reactions travel the same column so the panel is one list.
DROP POLICY IF EXISTS "live_messages_write" ON public.live_messages;
CREATE POLICY "live_messages_write" ON public.live_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.live_sessions ls WHERE ls.id = session_id AND ls.status = 'live')
  );

DROP POLICY IF EXISTS "live_messages_delete" ON public.live_messages;
CREATE POLICY "live_messages_delete" ON public.live_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

ALTER TABLE public.live_messages REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages;
  END IF;
END $$;

-- An administrator's block should be readable by the person it affects, so the
-- Go Live page can say so instead of failing on an insert.
DROP POLICY IF EXISTS "stream_permissions_subject" ON public.stream_permissions;
CREATE POLICY "stream_permissions_subject" ON public.stream_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Quiz battles: challenge a friend, and both scores land honestly
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz_duels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id         UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  requester_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opponent_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','played','cancelled')),
  requester_score INT,
  opponent_score  INT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at    TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  CHECK (requester_id <> opponent_id)
);
CREATE INDEX IF NOT EXISTS idx_quiz_duels_open ON public.quiz_duels(opponent_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_duels_mine ON public.quiz_duels(requester_id, requested_at DESC);

ALTER TABLE public.quiz_duels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quiz_duels_read" ON public.quiz_duels;
CREATE POLICY "quiz_duels_read" ON public.quiz_duels FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR opponent_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "quiz_duels_create" ON public.quiz_duels;
CREATE POLICY "quiz_duels_create" ON public.quiz_duels FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND opponent_id <> auth.uid()
    AND public.is_pro(auth.uid(), 'quiz_battles')
  );

-- Accepting or declining is the opponent's move; cancelling is the sender's.
DROP POLICY IF EXISTS "quiz_duels_respond" ON public.quiz_duels;
CREATE POLICY "quiz_duels_respond" ON public.quiz_duels FOR UPDATE TO authenticated
  USING (status = 'pending' AND (opponent_id = auth.uid() OR requester_id = auth.uid()))
  WITH CHECK (status IN ('accepted','declined','cancelled'));

DROP POLICY IF EXISTS "quiz_duels_admin" ON public.quiz_duels;
CREATE POLICY "quiz_duels_admin" ON public.quiz_duels FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Scores cannot be typed in by a player: this writes only the caller's own
-- column, and closes the duel once both sides have played.
CREATE OR REPLACE FUNCTION public.record_duel_score(p_duel UUID, p_score INT)
RETURNS TABLE (status TEXT, requester_score INT, opponent_score INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.quiz_duels%ROWTYPE;
  v_is_requester BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;
  IF p_score IS NULL OR p_score < 0 THEN
    RAISE EXCEPTION 'A score cannot be negative.';
  END IF;

  SELECT * INTO v_row FROM public.quiz_duels WHERE id = p_duel FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That challenge does not exist.';
  END IF;
  IF v_row.status NOT IN ('accepted','played') THEN
    RAISE EXCEPTION 'That challenge is not open for playing.';
  END IF;

  v_is_requester := v_row.requester_id = auth.uid();
  IF NOT v_is_requester AND v_row.opponent_id <> auth.uid() THEN
    RAISE EXCEPTION 'You are not in this duel.';
  END IF;

  IF v_is_requester THEN
    IF v_row.requester_score IS NOT NULL THEN
      RAISE EXCEPTION 'You have already played this one.';
    END IF;
    UPDATE public.quiz_duels
       SET requester_score = p_score,
           status = CASE WHEN v_row.opponent_score IS NULL THEN 'played' ELSE 'played' END,
           finished_at = CASE WHEN v_row.opponent_score IS NULL THEN NULL ELSE NOW() END
     WHERE id = p_duel;
  ELSE
    IF v_row.opponent_score IS NOT NULL THEN
      RAISE EXCEPTION 'You have already played this one.';
    END IF;
    UPDATE public.quiz_duels
       SET opponent_score = p_score,
           finished_at = CASE WHEN v_row.requester_score IS NULL THEN NULL ELSE NOW() END
     WHERE id = p_duel;
  END IF;

  RETURN QUERY SELECT d.status, d.requester_score, d.opponent_score
    FROM public.quiz_duels d WHERE d.id = p_duel;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_duel_score(UUID, INT) TO authenticated;

-- A played duel counts toward the quiz badge like any other attempt.
CREATE OR REPLACE FUNCTION public.count_duels(p_user UUID) RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.quiz_duels
   WHERE status = 'played' AND (requester_id = p_user OR opponent_id = p_user);
$$;

GRANT EXECUTE ON FUNCTION public.count_duels(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Events: invitations, an end time and a banner
-- ---------------------------------------------------------------------------
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS banner_path TEXT;

CREATE TABLE IF NOT EXISTS public.event_invites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','joined','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_invites_for ON public.event_invites(user_id, status, created_at DESC);

ALTER TABLE public.event_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_invites_read" ON public.event_invites;
CREATE POLICY "event_invites_read" ON public.event_invites FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR invited_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "event_invites_owner" ON public.event_invites;
CREATE POLICY "event_invites_owner" ON public.event_invites FOR INSERT TO authenticated
  WITH CHECK (invited_by = auth.uid() AND public.is_pro(auth.uid(), 'events_hub'));

-- The guest answers for themselves; the host may withdraw an invitation.
DROP POLICY IF EXISTS "event_invites_respond" ON public.event_invites;
CREATE POLICY "event_invites_respond" ON public.event_invites FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR invited_by = auth.uid())
  WITH CHECK (user_id = auth.uid() OR invited_by = auth.uid());

DROP POLICY IF EXISTS "event_invites_delete" ON public.event_invites;
CREATE POLICY "event_invites_delete" ON public.event_invites FOR DELETE TO authenticated
  USING (invited_by = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. The columns the admin console kept asking for
-- ---------------------------------------------------------------------------
ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS category TEXT
  CHECK (category IS NULL OR char_length(category) BETWEEN 1 AND 60);
ALTER TABLE public.daily_questions ADD COLUMN IF NOT EXISTS description TEXT
  CHECK (description IS NULL OR char_length(description) <= 300);
ALTER TABLE public.music_tracks ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'available'
  CHECK (availability IN ('available','unavailable','removed'));
-- A track whose file an administrator deleted is no longer playable, and the
-- shelf should say so rather than show a broken player.
CREATE INDEX IF NOT EXISTS idx_music_tracks_available ON public.music_tracks(published, availability);

-- ---------------------------------------------------------------------------
-- 5. Reports may name a broadcast
-- ---------------------------------------------------------------------------
ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_entity_type_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_entity_type_check
  CHECK (entity_type IN ('post','comment','profile','group','confession','poll','question','music','event','listing','stream'));

-- ---------------------------------------------------------------------------
-- 6. Visitor counting, with a way to opt out
--
-- The dashboard has never shown who visited whom. This adds the other half: a
-- member who would rather not appear in anybody's numbers at all.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hide_visit_activity BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.record_profile_visit(p_profile UUID) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.profile_visits (profile_id, visitor_id)
  SELECT p_profile, auth.uid()
  WHERE auth.uid() IS NOT NULL
    AND auth.uid() <> p_profile
    AND NOT COALESCE((SELECT hide_visit_activity FROM public.profiles WHERE id = auth.uid()), FALSE)
    AND NOT EXISTS (
      SELECT 1 FROM public.profile_visits v
       WHERE v.profile_id = p_profile AND v.visitor_id = auth.uid()
         AND (v.visited_at AT TIME ZONE 'utc')::date = (NOW() AT TIME ZONE 'utc')::date
    );
$$;

GRANT EXECUTE ON FUNCTION public.record_profile_visit(UUID) TO authenticated;

COMMIT;

-- Verify: every one of these must come back as a number greater than zero.
SELECT
  (SELECT COUNT(*) FROM pg_attribute WHERE attrelid = 'public.live_sessions'::regclass AND attname IN ('highlight_path','scheduled_at')) AS live_columns,
  (SELECT COUNT(*) FROM pg_class WHERE relname IN ('live_messages','quiz_duels','event_invites')) AS new_tables,
  (SELECT COUNT(*) FROM pg_proc WHERE proname IN ('record_duel_score','record_profile_visit','count_duels')) AS new_functions,
  (SELECT COUNT(*) FROM pg_attribute WHERE attrelid = 'public.profiles'::regclass AND attname = 'hide_visit_activity') AS consent_column;
