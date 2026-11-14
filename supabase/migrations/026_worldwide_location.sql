-- ============================================================
-- CONNEXA 026 — Worldwide profile location
--
-- The profile's location stops being a free-text line and becomes a
-- place: a region of the world, a country inside it, then a state or
-- province and a city inside that. Each level is optional below the
-- country, so someone who only wants "Brazil" is never forced further.
--
-- The old `location` column stays and keeps holding the sentence the
-- profile prints ("Lagos, Nigeria"), which is what every existing card
-- and header already reads.
--
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- ============================================================
BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT;

-- Values come from a fixed dataset, but a hand-built request could still send
-- anything, so the columns refuse nonsense rather than trusting the form.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_region_length;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_region_length
  CHECK (region IS NULL OR char_length(region) BETWEEN 1 AND 40);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_country_length;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_country_length
  CHECK (country IS NULL OR char_length(country) BETWEEN 1 AND 80);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_country_code_shape;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_country_code_shape
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_state_length;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_state_length
  CHECK (state IS NULL OR char_length(state) BETWEEN 1 AND 80);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_city_length;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_city_length
  CHECK (city IS NULL OR char_length(city) BETWEEN 1 AND 80);

-- A country is never recorded without the region it sits in, and a state or
-- city never without a country, so the dropdowns cannot save half a place.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_location_levels;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_location_levels CHECK (
  (country IS NULL OR region IS NOT NULL)
  AND (state IS NULL OR country IS NOT NULL)
  AND (city IS NULL OR country IS NOT NULL)
);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify: expects 5 | yes
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'profiles'
      AND column_name IN ('region','country','country_code','state','city')) AS columns,
  (SELECT CASE WHEN count(*) = 6 THEN 'yes' ELSE 'no' END FROM pg_constraint
    WHERE conname LIKE 'profiles_%length' OR conname IN ('profiles_country_code_shape','profiles_location_levels')) AS constraints;
