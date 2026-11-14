-- ============================================================
-- 024 — Study Room highlights
-- ============================================================
-- The reader now turns pages instead of scrolling, and a reader can mark a
-- sentence they want to keep. A highlight is stored as the paragraph number and
-- the character range inside it, which is how the reader re-paints the mark the
-- next time the book opens — no copied text, nothing that could drift out of
-- step with the book. Every row belongs to the reader who made it.
--
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. One row per marked range, per reader, per book
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.study_book_highlights (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id    UUID NOT NULL REFERENCES public.study_books(id) ON DELETE CASCADE,
  paragraph  INT  NOT NULL,
  start_char INT  NOT NULL,
  end_char   INT  NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The same selection must not stack up twice.
  CONSTRAINT study_highlights_unique UNIQUE (user_id, book_id, paragraph, start_char, end_char),
  CONSTRAINT study_highlights_paragraph_ok CHECK (paragraph >= 0),
  CONSTRAINT study_highlights_range_ok CHECK (start_char >= 0 AND end_char > start_char)
);

-- Opening a book asks "what has this reader marked in it?"
CREATE INDEX IF NOT EXISTS idx_study_highlights_book_reader
  ON public.study_book_highlights (user_id, book_id);

ALTER TABLE public.study_book_highlights ENABLE ROW LEVEL SECURITY;

-- Only the reader who made a highlight can see or change it.
DROP POLICY IF EXISTS "highlights_select" ON public.study_book_highlights;
CREATE POLICY "highlights_select" ON public.study_book_highlights FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "highlights_insert" ON public.study_book_highlights;
CREATE POLICY "highlights_insert" ON public.study_book_highlights FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "highlights_delete" ON public.study_book_highlights;
CREATE POLICY "highlights_delete" ON public.study_book_highlights FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Expected: 3 policies and the table listed.
SELECT
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'study_book_highlights') AS policies,
  (SELECT CASE WHEN to_regclass('public.study_book_highlights') IS NOT NULL THEN 'live' ELSE 'missing' END) AS table_state;
