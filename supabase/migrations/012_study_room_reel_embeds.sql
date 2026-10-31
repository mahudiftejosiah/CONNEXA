-- ============================================================
-- 012: Study Room (user-submitted links) + curated reel embeds
--      (real TikTok / YouTube videos in the Reels feed)
-- ============================================================

-- ------------------------------------------------------------
-- STUDY RESOURCES — any signed-in user can add a link card
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.study_resources (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  url         TEXT NOT NULL CHECK (url ~ '^https?://'),
  cover_url   TEXT,
  description TEXT CHECK (description IS NULL OR char_length(description) <= 280),
  added_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_resources_created_at ON public.study_resources(created_at DESC);

ALTER TABLE public.study_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_select" ON public.study_resources;
CREATE POLICY "study_select" ON public.study_resources FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "study_insert" ON public.study_resources;
CREATE POLICY "study_insert" ON public.study_resources FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = added_by
);

DROP POLICY IF EXISTS "study_delete" ON public.study_resources;
CREATE POLICY "study_delete" ON public.study_resources FOR DELETE TO authenticated USING (
  auth.uid() = added_by
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);

-- ------------------------------------------------------------
-- REEL EMBEDS — official TikTok/YouTube embeds shown in Reels
-- (admin-curated, like external games)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reel_embeds (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform    TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube')),
  external_id TEXT NOT NULL,
  caption     TEXT,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reel_embeds_unique UNIQUE (platform, external_id)
);

ALTER TABLE public.reel_embeds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reels_select" ON public.reel_embeds;
CREATE POLICY "reels_select" ON public.reel_embeds FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "reels_insert" ON public.reel_embeds;
CREATE POLICY "reels_insert" ON public.reel_embeds FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);

DROP POLICY IF EXISTS "reels_update" ON public.reel_embeds;
CREATE POLICY "reels_update" ON public.reel_embeds FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);

DROP POLICY IF EXISTS "reels_delete" ON public.reel_embeds;
CREATE POLICY "reels_delete" ON public.reel_embeds FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
);

-- ------------------------------------------------------------
-- SEED — every ID below was verified against the official
-- oEmbed endpoints on 2026-10-31 (live and embeddable)
-- ------------------------------------------------------------
insert into public.reel_embeds (platform, external_id, caption) values
  ('tiktok',  '6979606181463526661', 'Khaby Lame roastingly simplifies a complicated car hack'),
  ('tiktok',  '6894081763379924229', 'Billie Eilish messing with the face-distortion filter'),
  ('tiktok',  '6863663621667392773', 'Addison Rae doing the viral dance'),
  ('tiktok',  '6932635718615338246', 'Nick Luciano singing an upbeat medley'),
  ('tiktok',  '6990181852803894533', 'Teto''s dance choreography to the duet track'),
  ('tiktok',  '7058186727248235782', 'Jamie dancing to the pop classic'),
  ('tiktok',  '6901709683568938245', 'The most contagious baby laugh on the internet'),
  ('tiktok',  '6975140587196517638', 'Chipmunks stuffing their cheek pouches'),
  ('tiktok',  '6753718966637677830', 'Kisonkee and the milk bottles'),
  ('tiktok',  '7332187682480590112', 'Fresh fruit dipped in melted candy'),
  ('youtube', 'jNQXAC9IVRw',         'The FIRST YouTube video ever — "Me at the zoo" (2005)'),
  ('youtube', 'dQw4w9WgXcQ',         'Rick Astley — Never Gonna Give You Up'),
  ('youtube', 'kJQP7kiw5Fk',         'Luis Fonsi — Despacito ft. Daddy Yankee'),
  ('youtube', '9bZkp7q19f0',         'PSY — Gangnam Style'),
  ('youtube', 'OPf0YbXqDm0',         'Mark Ronson — Uptown Funk ft. Bruno Mars'),
  ('youtube', 'hT_nvWreIhg',         'OneRepublic — Counting Stars'),
  ('youtube', 'JGwWNGJdvx8',         'Ed Sheeran — Shape of You'),
  ('youtube', 'YQHsXMglC9A',         'Adele — Hello'),
  ('youtube', '60ItHLz5WEA',         'Alan Walker — Faded'),
  ('youtube', '09R8_2nJtjg',         'Maroon 5 — Sugar')
on conflict (platform, external_id) do nothing;

-- ------------------------------------------------------------
-- SEED — Study Room starter resources (verified sites)
-- ------------------------------------------------------------
insert into public.study_resources (title, url, cover_url, description, added_by)
select x.title, x.url, x.cover, x.descr, null
from (values
  ('Khan Academy',
   'https://www.khanacademy.org',
   'https://www.google.com/s2/favicons?domain=khanacademy.org&sz=128',
   'Free lessons and practice — math, science, SAT prep.'),
  ('Coursera',
   'https://www.coursera.org',
   'https://www.google.com/s2/favicons?domain=coursera.org&sz=128',
   'University courses you can audit for free.'),
  ('MIT OpenCourseWare',
   'https://ocw.mit.edu',
   'https://www.google.com/s2/favicons?domain=ocw.mit.edu&sz=128',
   'Full MIT course materials, free forever.'),
  ('freeCodeCamp',
   'https://www.freecodecamp.org',
   'https://www.google.com/s2/favicons?domain=freecodecamp.org&sz=128',
   'Learn to code by building real projects.'),
  ('Duolingo',
   'https://www.duolingo.com',
   'https://www.google.com/s2/favicons?domain=duolingo.com&sz=128',
   'Five minutes of language practice a day.'),
  ('YouTube EDU',
   'https://www.youtube.com/education',
   'https://www.google.com/s2/favicons?domain=youtube.com&sz=128',
   'Curated educational channels and playlists.')
) as x(title, url, cover, descr)
where not exists (select 1 from public.study_resources);
