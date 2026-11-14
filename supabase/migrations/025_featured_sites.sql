-- ============================================================
-- CONNEXA 025 — Featured sites
--
-- The Discover page gains a Featured tab that lists hand-picked
-- external websites. They live in the table the Sports and Study
-- rails already read (site_shortcuts) so one admin screen keeps every
-- curated link honest; this adds the bucket, the label shown on the
-- card, and a published switch so a site can be staged and hidden.
--
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- ============================================================
BEGIN;

-- 1) A 'featured' bucket alongside the three existing ones. The inline CHECK
--    from 013 is named site_shortcuts_category_check, so it is replaced, not
--    stacked, or a featured row would still be rejected.
ALTER TABLE public.site_shortcuts DROP CONSTRAINT IF EXISTS site_shortcuts_category_check;
ALTER TABLE public.site_shortcuts
  ADD CONSTRAINT site_shortcuts_category_check
  CHECK (category IN ('study','sports','betting','featured'));

-- 2) published — only true rows reach Discover.
--    site_category — the optional chip printed on the card ("Research",
--    "Learning"…); the row's own category stays the bucket it is filed under.
ALTER TABLE public.site_shortcuts ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.site_shortcuts ADD COLUMN IF NOT EXISTS site_category TEXT
  CHECK (site_category IS NULL OR char_length(site_category) BETWEEN 1 AND 40);

-- The Discover query filters on both, so extend the index it already uses.
CREATE INDEX IF NOT EXISTS idx_site_shortcuts_featured
  ON public.site_shortcuts(category, published, sort);

-- 3) A starter shelf, so the tab opens on real sites rather than an empty box.
--    Deterministic ids keep this idempotent — a plain INSERT ... ON CONFLICT
--    with generated uuids would add a fresh copy on every run.
INSERT INTO public.site_shortcuts
  (id, category, name, url, logo_url, description, site_category, published, sort) VALUES
  ('0f3a7e01-0000-4000-8000-000000000001','featured','Khan Academy','https://www.khanacademy.org',
   'https://www.google.com/s2/favicons?domain=khanacademy.org&sz=128',
   'Free lessons and practice in nearly every school subject.','Learning',TRUE,10),
  ('0f3a7e01-0000-4000-8000-000000000002','featured','NASA','https://www.nasa.gov',
   'https://www.google.com/s2/favicons?domain=nasa.gov&sz=128',
   'Mission news, live launches and open imagery of the solar system.','Science',TRUE,20),
  ('0f3a7e01-0000-4000-8000-000000000003','featured','Internet Archive','https://archive.org',
   'https://www.google.com/s2/favicons?domain=archive.org&sz=128',
   'Millions of free books, recordings and software to read or borrow.','Library',TRUE,30),
  ('0f3a7e01-0000-4000-8000-000000000004','featured','Our World in Data','https://ourworldindata.org',
   'https://www.google.com/s2/favicons?domain=ourworldindata.org&sz=128',
   'Charts and research on how living standards change over time.','Research',TRUE,40),
  ('0f3a7e01-0000-4000-8000-000000000005','featured','Duolingo','https://www.duolingo.com',
   'https://www.google.com/s2/favicons?domain=duolingo.com&sz=128',
   'Short daily lessons in more than forty languages.','Languages',TRUE,50),
  ('0f3a7e01-0000-4000-8000-000000000006','featured','Coursera','https://www.coursera.org',
   'https://www.google.com/s2/favicons?domain=coursera.org&sz=128',
   'University courses you can audit for free.','Courses',TRUE,60)
ON CONFLICT (id) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify: expects 1 | live | yes | yes | 6
SELECT
  (SELECT count(*) FROM pg_constraint WHERE conname = 'site_shortcuts_category_check') AS check,
  (SELECT count(*) FROM pg_indexes WHERE indexname = 'idx_site_shortcuts_featured') AS "live",
  (SELECT CASE WHEN count(*) = 2 THEN 'yes' ELSE 'no' END FROM information_schema.columns
    WHERE table_name = 'site_shortcuts' AND column_name IN ('published','site_category')) AS columns,
  (SELECT CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'site_shortcuts' AND policyname = 'shortcuts_admin'
  ) THEN 'yes' ELSE 'no' END) AS admin_write,
  (SELECT count(*) FROM public.site_shortcuts WHERE category = 'featured' AND published) AS featured;
