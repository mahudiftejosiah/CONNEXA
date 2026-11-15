-- ============================================================
-- CONNEXA 030 — CONNEXA PRO: community
--
-- Daily questions, anonymous confessions, community polls and the
-- hashtag blocklist. Confessions keep their author in a table of
-- its own so the public record holds no identity at all.
--
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- ============================================================
BEGIN;

-- ---------- Daily questions ----------
CREATE TABLE IF NOT EXISTS public.daily_questions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question   TEXT NOT NULL CHECK (char_length(question) BETWEEN 3 AND 300),
  category   TEXT CHECK (category IS NULL OR char_length(category) BETWEEN 1 AND 40),
  asked_on   DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::date,
  published  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_daily_questions_recent ON public.daily_questions(asked_on DESC, created_at DESC);

ALTER TABLE public.daily_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_questions_select" ON public.daily_questions;
CREATE POLICY "daily_questions_select" ON public.daily_questions FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "daily_questions_owner" ON public.daily_questions;
CREATE POLICY "daily_questions_owner" ON public.daily_questions FOR ALL
  USING (author_id = auth.uid() OR public.is_admin())
  WITH CHECK (author_id = auth.uid() OR public.is_admin());

CREATE TABLE IF NOT EXISTS public.daily_question_replies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID NOT NULL REFERENCES public.daily_questions(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answer       TEXT NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_dq_replies_question ON public.daily_question_replies(question_id, created_at DESC);

ALTER TABLE public.daily_question_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dq_replies_select" ON public.daily_question_replies;
CREATE POLICY "dq_replies_select" ON public.daily_question_replies FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "dq_replies_write" ON public.daily_question_replies;
CREATE POLICY "dq_replies_write" ON public.daily_question_replies FOR ALL
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ---------- Anonymous confessions ----------
-- The public row is body, tag and time. Nothing else.
CREATE TABLE IF NOT EXISTS public.confessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 5 AND 1500),
  tag        TEXT CHECK (tag IS NULL OR char_length(tag) BETWEEN 1 AND 40),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_confessions_feed ON public.confessions(status, created_at DESC);

-- Kept apart on purpose: only the submitter and an administrator can join a
-- confession to the person who wrote it, so a reader cannot ever ask.
CREATE TABLE IF NOT EXISTS public.confession_authors (
  confession_id UUID PRIMARY KEY REFERENCES public.confessions(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.confessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confession_authors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "confessions_select" ON public.confessions;
CREATE POLICY "confessions_select" ON public.confessions FOR SELECT
  USING (status = 'approved' OR public.is_admin());

DROP POLICY IF EXISTS "confessions_insert" ON public.confessions;
CREATE POLICY "confessions_insert" ON public.confessions FOR INSERT
  TO authenticated WITH CHECK (TRUE);

DROP POLICY IF EXISTS "confessions_admin" ON public.confessions;
CREATE POLICY "confessions_admin" ON public.confessions FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "confessions_delete" ON public.confessions;
CREATE POLICY "confessions_delete" ON public.confessions FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "confession_authors_select" ON public.confession_authors;
CREATE POLICY "confession_authors_select" ON public.confession_authors FOR SELECT
  USING (author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "confession_authors_insert" ON public.confession_authors;
CREATE POLICY "confession_authors_insert" ON public.confession_authors FOR INSERT
  TO authenticated WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "confession_authors_delete" ON public.confession_authors;
CREATE POLICY "confession_authors_delete" ON public.confession_authors FOR DELETE USING (public.is_admin());

-- ---------- Community polls ----------
CREATE TABLE IF NOT EXISTS public.polls (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question   TEXT NOT NULL CHECK (char_length(question) BETWEEN 3 AND 300),
  closes_at  TIMESTAMPTZ,
  published  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.poll_options (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id   UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  label     TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  position  INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_poll_options ON public.poll_options(poll_id, position);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id    UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_id  UUID NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, user_id)
);

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "polls_select" ON public.polls;
CREATE POLICY "polls_select" ON public.polls FOR SELECT
  USING (published OR owner_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "polls_owner" ON public.polls;
CREATE POLICY "polls_owner" ON public.polls FOR ALL
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "poll_options_select" ON public.poll_options;
CREATE POLICY "poll_options_select" ON public.poll_options FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "poll_options_owner" ON public.poll_options;
CREATE POLICY "poll_options_owner" ON public.poll_options FOR ALL
  USING (EXISTS (SELECT 1 FROM public.polls p WHERE p.id = poll_id AND (p.owner_id = auth.uid() OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.polls p WHERE p.id = poll_id AND (p.owner_id = auth.uid() OR public.is_admin())));

DROP POLICY IF EXISTS "poll_votes_select" ON public.poll_votes;
CREATE POLICY "poll_votes_select" ON public.poll_votes FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "poll_votes_write" ON public.poll_votes;
CREATE POLICY "poll_votes_write" ON public.poll_votes FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "poll_votes_own" ON public.poll_votes;
CREATE POLICY "poll_votes_own" ON public.poll_votes FOR DELETE USING (user_id = auth.uid() OR public.is_admin());

-- ---------- Trending hashtags, moderation side ----------
-- Trending itself is computed from real posts; this only names the tags an
-- administrator has taken out of the list.
CREATE TABLE IF NOT EXISTS public.blocked_hashtags (
  tag        TEXT PRIMARY KEY,
  blocked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.blocked_hashtags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blocked_hashtags_select" ON public.blocked_hashtags;
CREATE POLICY "blocked_hashtags_select" ON public.blocked_hashtags FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "blocked_hashtags_admin" ON public.blocked_hashtags;
CREATE POLICY "blocked_hashtags_admin" ON public.blocked_hashtags FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Reporting a confession or a poll uses the same reports queue everything else
-- already lands in, so the admin panel keeps one inbox.
ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_entity_type_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_entity_type_check CHECK (entity_type IN
  ('post', 'comment', 'profile', 'group', 'confession', 'poll', 'question', 'music', 'event', 'listing'));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify: expects yes x 9
SELECT
  (SELECT CASE WHEN to_regclass('public.daily_questions') IS NOT NULL THEN 'yes' ELSE 'no' END) AS questions,
  (SELECT CASE WHEN to_regclass('public.daily_question_replies') IS NOT NULL THEN 'yes' ELSE 'no' END) AS replies,
  (SELECT CASE WHEN to_regclass('public.confessions') IS NOT NULL THEN 'yes' ELSE 'no' END) AS confessions,
  (SELECT CASE WHEN to_regclass('public.confession_authors') IS NOT NULL THEN 'yes' ELSE 'no' END) AS hidden_authors,
  (SELECT CASE WHEN to_regclass('public.polls') IS NOT NULL THEN 'yes' ELSE 'no' END) AS polls,
  (SELECT CASE WHEN to_regclass('public.poll_options') IS NOT NULL THEN 'yes' ELSE 'no' END) AS options,
  (SELECT CASE WHEN to_regclass('public.poll_votes') IS NOT NULL THEN 'yes' ELSE 'no' END) AS votes,
  (SELECT CASE WHEN to_regclass('public.blocked_hashtags') IS NOT NULL THEN 'yes' ELSE 'no' END) AS blocked_tags,
  (SELECT CASE WHEN count(*) >= 20 THEN 'yes' ELSE 'no' END FROM pg_policies
     WHERE tablename IN ('daily_questions','daily_question_replies','confessions','confession_authors','polls','poll_options','poll_votes','blocked_hashtags')) AS policies;
