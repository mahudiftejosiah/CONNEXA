-- ============================================================
-- CONNEXA 036 — Homepage featured slideshow
--
-- A premium promotional carousel that sits between the Stories
-- tray and the feed. Every slide is a row here: image, copy,
-- destination, call-to-action, order, duration, schedule and a
-- published switch. The admin Slideshow tab and the homepage read
-- the same rows, so a change in the dashboard is live on the next
-- page load — no deployment.
--
-- Images live in the existing public `covers` bucket (the same one
-- profile covers and thumbnails use); a slide stores the public URL
-- that bucket returns. Nothing new is created in storage.
--
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.featured_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  alt TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  -- none | internal | event | announcement | post | group | profile | external
  destination_type TEXT NOT NULL DEFAULT 'none'
    CHECK (destination_type IN ('none','internal','event','announcement','post','group','profile','external')),
  link_url TEXT NOT NULL DEFAULT '',
  cta_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  cta_text TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 6000 CHECK (duration_ms BETWEEN 2000 AND 60000),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(title) <= 90),
  CHECK (char_length(description) <= 220),
  CHECK (char_length(alt) <= 180),
  CHECK (char_length(cta_text) <= 32),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_featured_slides_live
  ON public.featured_slides(active, sort);

CREATE OR REPLACE FUNCTION public.touch_featured_slides()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS featured_slides_touch ON public.featured_slides;
CREATE TRIGGER featured_slides_touch BEFORE UPDATE ON public.featured_slides
  FOR EACH ROW EXECUTE FUNCTION public.touch_featured_slides();

ALTER TABLE public.featured_slides ENABLE ROW LEVEL SECURITY;

-- Signed-in members only ever see published slides inside their window.
DROP POLICY IF EXISTS featured_slides_read_live ON public.featured_slides;
CREATE POLICY featured_slides_read_live ON public.featured_slides
  FOR SELECT TO authenticated
  USING (
    active
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );

-- Administrators see every row, including staged and expired ones.
DROP POLICY IF EXISTS featured_slides_admin_read ON public.featured_slides;
CREATE POLICY featured_slides_admin_read ON public.featured_slides
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS featured_slides_admin_write ON public.featured_slides;
CREATE POLICY featured_slides_admin_write ON public.featured_slides
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- A starter reel of twelve slides so the homepage opens lively.
-- Deterministic ids keep this idempotent. Administrators replace
-- these with their own uploads from the Slideshow tab; the images
-- are placeholders served by picsum, not bundled assets.
-- ------------------------------------------------------------
INSERT INTO public.featured_slides
  (id, title, description, alt, image_url, destination_type, link_url, cta_enabled, cta_text, active, sort, duration_ms)
VALUES
  ('0f3a7e02-0000-4000-8000-000000000001',
   'Game night, every night',
   'Eleven ways to play — solo puzzles, live chess and friend-versus battles. Your move.',
   'Friends gathered around a glowing game board',
   'https://picsum.photos/seed/connexa-games/1200/675',
   'internal', '/games', TRUE, 'PLAY NOW', TRUE, 10, 6000),

  ('0f3a7e02-0000-4000-8000-000000000002',
   'Discover what is trending',
   'Live scores, featured sites and the conversations everyone is joining right now.',
   'A city skyline lit up at dusk',
   'https://picsum.photos/seed/connexa-discover/1200/675',
   'internal', '/discover', TRUE, 'DISCOVER MORE', TRUE, 20, 6000),

  ('0f3a7e02-0000-4000-8000-000000000003',
   'Your library, reimagined',
   'Hundreds of free classics in a reading room that remembers your page, your highlights and your shelf.',
   'Tall library shelves warm with reading light',
   'https://picsum.photos/seed/connexa-library/1200/675',
   'internal', '/study', TRUE, 'OPEN THE LIBRARY', TRUE, 30, 7000),

  ('0f3a7e02-0000-4000-8000-000000000004',
   'Go PRO. Stand out.',
   'A golden crown beside your name, analytics, creator tools and the live room — all unlocked.',
   'A golden crown catching the light',
   'https://picsum.photos/seed/connexa-pro/1200/675',
   'announcement', '/pro', TRUE, 'UPGRADE TO PRO', TRUE, 40, 7000),

  ('0f3a7e02-0000-4000-8000-000000000005',
   'Find your people',
   'Public groups for every interest — study circles, game clans, music corners and more.',
   'A circle of friends talking and laughing',
   'https://picsum.photos/seed/connexa-groups/1200/675',
   'group', '/groups', TRUE, 'JOIN A GROUP', TRUE, 50, 6000),

  ('0f3a7e02-0000-4000-8000-000000000006',
   'Reels that move you',
   'Short, full-screen video from across CONNEXA. Swipe up, settle in, press play.',
   'Stage lights sweeping across a crowd',
   'https://picsum.photos/seed/connexa-reels/1200/675',
   'internal', '/reels', TRUE, 'WATCH REELS', TRUE, 60, 5000),

  ('0f3a7e02-0000-4000-8000-000000000007',
   'Moments worth sharing',
   'Stories that last a day and feel like they are happening right now. Add yours to the tray.',
   'Sparklers writing light in the dark',
   'https://picsum.photos/seed/connexa-stories/1200/675',
   'internal', '/stories', TRUE, 'SHARE A STORY', TRUE, 70, 6000),

  ('0f3a7e02-0000-4000-8000-000000000008',
   'Friends make it better',
   'Send a wave, start a chat, plan a game. The people who matter are one tap away.',
   'Two friends sharing a phone and smiling',
   'https://picsum.photos/seed/connexa-friends/1200/675',
   'internal', '/friends', TRUE, 'FIND FRIENDS', TRUE, 80, 6000),

  ('0f3a7e02-0000-4000-8000-000000000009',
   'Live, together',
   'PRO members broadcast straight to their followers — viewer chat, reactions and a highlight reel.',
   'A microphone under a single warm spotlight',
   'https://picsum.photos/seed/connexa-live/1200/675',
   'event', '/live', TRUE, 'GO LIVE', TRUE, 90, 7000),

  ('0f3a7e02-0000-4000-8000-000000000010',
   'Keep what you love',
   'Saved posts, pinned messages and your favourite reads — all waiting in one quiet place.',
   'A neatly arranged desk with a notebook and coffee',
   'https://picsum.photos/seed/connexa-saved/1200/675',
   'internal', '/saved', TRUE, 'VIEW SAVED', TRUE, 100, 6000),

  ('0f3a7e02-0000-4000-8000-000000000011',
   'Say it with a wave',
   'Voice notes, stickers and replies that feel like talking. Your conversations start here.',
   'Paper planes crossing a bright sky',
   'https://picsum.photos/seed/connexa-messages/1200/675',
   'internal', '/messages', TRUE, 'START CHATTING', TRUE, 110, 6000),

  ('0f3a7e02-0000-4000-8000-000000000012',
   'The world beyond CONNEXA',
   'Curated corners of the open web — research, libraries and learning, one click away.',
   'An open book beside a globe',
   'https://picsum.photos/seed/connexa-world/1200/675',
   'external', 'https://www.wikipedia.org', TRUE, 'EXPLORE NOW', TRUE, 120, 8000)
ON CONFLICT (id) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify: expects featured_slides | t | 12
SELECT
  (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'featured_slides') AS featured_slides,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'featured_slides') AS rls_on,
  (SELECT count(*) FROM public.featured_slides) AS seeded;