-- ============================================================
-- 018 — Study Room reading progress
-- ============================================================
-- The Study Room used to hand a book over as an outside link, so the app could
-- not tell where anyone had stopped. These rows hold that marker: one per
-- reader per book, with the paragraph offset the in-app reader returns to and
-- the rounded percentage the shelves draw on the spine.
--
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. One progress row per reader per book
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.study_progress (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id     UUID NOT NULL REFERENCES public.study_books(id) ON DELETE CASCADE,
  position    INT  NOT NULL DEFAULT 0,
  percent     INT  NOT NULL DEFAULT 0,
  finished_at TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT study_progress_unique UNIQUE (user_id, book_id),
  CONSTRAINT study_progress_position_ok CHECK (position >= 0),
  CONSTRAINT study_progress_percent_ok CHECK (percent >= 0 AND percent <= 100)
);

-- The shelves ask "what is this reader working through?" and the reader answers
-- with the newest row, so both are served by this order.
CREATE INDEX IF NOT EXISTS idx_study_progress_user_recent
  ON public.study_progress (user_id, updated_at DESC);

ALTER TABLE public.study_progress ENABLE ROW LEVEL SECURITY;

-- A reader sees and edits their own marker; an admin can see everything the way
-- every other per-user table in this schema is arranged.
DROP POLICY IF EXISTS "progress_select" ON public.study_progress;
CREATE POLICY "progress_select" ON public.study_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "progress_write" ON public.study_progress;
CREATE POLICY "progress_write" ON public.study_progress FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS study_progress_updated_at ON public.study_progress;
CREATE TRIGGER study_progress_updated_at BEFORE UPDATE ON public.study_progress
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Expected: one row — progress_select, progress_write and the trigger all live.
SELECT
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'study_progress') AS policies,
  (SELECT COUNT(*) FROM pg_trigger WHERE tgname = 'study_progress_updated_at') AS trigger_live;
