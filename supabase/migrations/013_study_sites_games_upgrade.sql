-- ============================================================
-- CONNEXA 013 — Study books, site shortcuts (sports/betting),
--               credits + upgrade settings, game score save,
--               live game requests, presence (last_seen),
--               paid verification upgrades
-- ============================================================

-- ------------------------------------------------------------
-- 1) PRESENCE — profiles.last_seen (self heartbeat)
-- ------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

-- ------------------------------------------------------------
-- 2) SITE SHORTCUTS — admin-curated external site icons
--    categories: study | sports | betting
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_shortcuts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category    TEXT NOT NULL CHECK (category IN ('study','sports','betting')),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  url         TEXT NOT NULL CHECK (url ~ '^https?://'),
  logo_url    TEXT,
  description TEXT CHECK (description IS NULL OR char_length(description) <= 200),
  sort        INT  NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_shortcuts_category ON public.site_shortcuts(category, sort);

ALTER TABLE public.site_shortcuts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shortcuts_select" ON public.site_shortcuts;
CREATE POLICY "shortcuts_select" ON public.site_shortcuts FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "shortcuts_admin" ON public.site_shortcuts;
CREATE POLICY "shortcuts_admin" ON public.site_shortcuts FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed (verified sites). Favicons come from Google's public s2 icon service.
INSERT INTO public.site_shortcuts (category, name, url, logo_url, description, sort) VALUES
  -- Sports & browse
  ('sports','SofaScore','https://www.sofascore.com','https://www.google.com/s2/favicons?domain=sofascore.com&sz=128','Live scores, stats & standings',10),
  ('sports','Flashscore','https://www.flashscore.com','https://www.google.com/s2/favicons?domain=flashscore.com&sz=128','Real-time match results',20),
  ('sports','Livescore','https://www.livescore.com','https://www.google.com/s2/favicons?domain=livescore.com&sz=128','Football live scores',30),
  ('sports','ESPN','https://www.espn.com','https://www.google.com/s2/favicons?domain=espn.com&sz=128','Scores, news & highlights',40),
  ('sports','BBC Sport','https://www.bbc.com/sport','https://www.google.com/s2/favicons?domain=bbc.com&sz=128','Sports news & live pages',50),
  ('sports','FotMob','https://www.fotmob.com','https://www.google.com/s2/favicons?domain=fotmob.com&sz=128','Match centre & transfers',60),
  -- Betting
  ('betting','Bet9ja','https://www.bet9ja.com','https://www.google.com/s2/favicons?domain=bet9ja.com&sz=128','Sports betting (NG)',10),
  ('betting','SportyBet','https://www.sportybet.com','https://www.google.com/s2/favicons?domain=sportybet.com&sz=128','Bet & live odds',20),
  ('betting','BetKing','https://www.betking.com','https://www.google.com/s2/favicons?domain=betking.com&sz=128','Sportsbook & casino',30),
  ('betting','Premier Bet','https://premierbetng.com','https://www.google.com/s2/favicons?domain=premierbetng.com&sz=128','Odds & promotions',40),
  ('betting','Nairabet','https://www.nairabet.com','https://www.google.com/s2/favicons?domain=nairabet.com&sz=128','Payout betting',50),
  -- Study
  ('study','BBC Bitesize','https://www.bbc.co.uk/bitesize','https://www.google.com/s2/favicons?domain=bbc.co.uk&sz=128','School revision',10),
  ('study','Quizlet','https://quizlet.com','https://www.google.com/s2/favicons?domain=quizlet.com&sz=128','Flashcards & study sets',20),
  ('study','Wikipedia','https://www.wikipedia.org','https://www.google.com/s2/favicons?domain=wikipedia.org&sz=128','Reference articles',30),
  ('study','Britannica','https://www.britannica.com','https://www.google.com/s2/favicons?domain=britannica.com&sz=128','Encyclopedia',40),
  ('study','Google Scholar','https://scholar.google.com','https://www.google.com/s2/favicons?domain=scholar.google.com&sz=128','Academic papers',50)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 3) STUDY BOOKS — curated free books per category
--    categories: educational | story | inspirational | holy
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.study_books (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category    TEXT NOT NULL CHECK (category IN ('educational','story','inspirational','holy')),
  title       TEXT NOT NULL,
  author      TEXT,
  pdf_url     TEXT NOT NULL CHECK (pdf_url ~ '^https?://'),
  cover_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_study_books_category ON public.study_books(category);

ALTER TABLE public.study_books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "books_select" ON public.study_books;
CREATE POLICY "books_select" ON public.study_books FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "books_admin" ON public.study_books;
CREATE POLICY "books_admin" ON public.study_books FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Holy books (Bible + Quran only), idempotent via a deterministic id.
INSERT INTO public.study_books (id, category, title, author, pdf_url, cover_url) VALUES
  ('0a1e2b01-0000-4000-8000-000000000001','holy','The Holy Bible','King James Version',
   'https://www.biblegateway.com','https://www.google.com/s2/favicons?domain=biblegateway.com&sz=128'),
  ('0a1e2b01-0000-4000-8000-000000000002','holy','The Holy Quran','Clear Quran translation',
   'https://quran.com','https://www.google.com/s2/favicons?domain=quran.com&sz=128')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 4) GAME SCORES — per-user best + resumable state
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_scores (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_id    TEXT NOT NULL,
  best       INT  NOT NULL DEFAULT 0,
  points     INT  NOT NULL DEFAULT 0,
  state      JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT game_scores_unique UNIQUE (user_id, game_id)
);
ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scores_select" ON public.game_scores;
CREATE POLICY "scores_select" ON public.game_scores FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());
DROP POLICY IF EXISTS "scores_write" ON public.game_scores;
CREATE POLICY "scores_write" ON public.game_scores FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 5) GAME REQUESTS — live challenges (whot | chess | ludo)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game          TEXT NOT NULL CHECK (game IN ('whot','chess','ludo')),
  challenger_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opponent_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','declined','cancelled','done')),
  state         JSONB,
  turn          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  winner_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_game_requests_participants ON public.game_requests(challenger_id, opponent_id, created_at DESC);

ALTER TABLE public.game_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "games_select" ON public.game_requests;
CREATE POLICY "games_select" ON public.game_requests FOR SELECT TO authenticated
  USING (auth.uid() IN (challenger_id, opponent_id) OR public.is_admin());
DROP POLICY IF EXISTS "games_insert" ON public.game_requests;
CREATE POLICY "games_insert" ON public.game_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = challenger_id);
DROP POLICY IF EXISTS "games_update" ON public.game_requests;
CREATE POLICY "games_update" ON public.game_requests FOR UPDATE TO authenticated
  USING (auth.uid() IN (challenger_id, opponent_id) OR public.is_admin());
DROP POLICY IF EXISTS "games_delete" ON public.game_requests;
CREATE POLICY "games_delete" ON public.game_requests FOR DELETE TO authenticated
  USING (auth.uid() IN (challenger_id, opponent_id) OR public.is_admin());

-- Presence for realtime broadcasts (needed for UPDATE old_record on some clients).
ALTER TABLE public.game_requests REPLICA IDENTITY FULL;

-- Add to Supabase realtime publication if it exists (dashboard-managed pub).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'game_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_requests;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 6) ACCOUNT UPGRADES — paid verification (admin-controlled)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_upgrades (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount      NUMERIC NOT NULL DEFAULT 0,
  reference   TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  note        TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_account_upgrades_user ON public.account_upgrades(user_id, created_at DESC);

ALTER TABLE public.account_upgrades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "upgrades_select" ON public.account_upgrades;
CREATE POLICY "upgrades_select" ON public.account_upgrades FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());
DROP POLICY IF EXISTS "upgrades_insert" ON public.account_upgrades;
CREATE POLICY "upgrades_insert" ON public.account_upgrades FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');
-- Admin updates (approve/reject) via the ALL policy below.
DROP POLICY IF EXISTS "upgrades_admin" ON public.account_upgrades;
CREATE POLICY "upgrades_admin" ON public.account_upgrades FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- User may cancel their own still-pending request (delete) before admin acts.
DROP POLICY IF EXISTS "upgrades_cancel_own" ON public.account_upgrades;
CREATE POLICY "upgrades_cancel_own" ON public.account_upgrades FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending');

-- Approving an upgrade sets the profile's green tick.
CREATE OR REPLACE FUNCTION public.apply_upgrade_verified() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.profiles SET is_verified = TRUE WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS account_upgrades_verified ON public.account_upgrades;
CREATE TRIGGER account_upgrades_verified
  AFTER UPDATE OF status ON public.account_upgrades
  FOR EACH ROW EXECUTE FUNCTION public.apply_upgrade_verified();

-- ------------------------------------------------------------
-- 7) SITE CONTENT — extend keys with 'credits' + 'upgrade'
-- ------------------------------------------------------------
ALTER TABLE public.site_content DROP CONSTRAINT IF EXISTS site_content_key_check;
ALTER TABLE public.site_content
  ADD CONSTRAINT site_content_key_check
  CHECK (key IN ('terms','rules','privacy','about','credits','upgrade'));

INSERT INTO public.site_content (key, title, body) VALUES
('credits','Credits',$$CONNEXA

Built and maintained with care.

Special thanks
• DMFtech — powering CONNEXA
• Our community of early members
• Open fonts, icons and libraries used throughout

Want to be listed here? An admin can add you on the Credits page.$$),
('upgrade','Verified Account Upgrade',$$Upgraded accounts get a green verification tick on their profile.

PRICE: 5000
PAY TO ACCOUNT NAME: CONNEXA (DMFtech)
PAY TO ACCOUNT NUMBER: 0000000000
INSTRUCTIONS: Send the exact price to the account above, then tap "I have paid" below and enter your payment reference. The admin reviews payments and applies the tick once confirmed.$$)
ON CONFLICT (key) DO NOTHING;
