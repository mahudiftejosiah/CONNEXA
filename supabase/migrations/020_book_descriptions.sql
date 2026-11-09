-- ============================================================
-- 020 — A blurb on every shelf book
-- ============================================================
-- The rebuilt Study Room is a shelf you walk along, and the card that rises
-- when a reader slides over a book has to say something about it. Gutenberg
-- gives us the text but not the summary, so the publishers' own blurbs are
-- kept here — one column, filled by supabase/seed_book_descriptions.sql.
--
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

BEGIN;

ALTER TABLE public.study_books ADD COLUMN IF NOT EXISTS description TEXT;

COMMIT;

-- Check it landed:
SELECT count(*) AS books, count(description) AS with_description FROM public.study_books;
