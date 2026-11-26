-- 040: onboarding completion tracking
-- Adds onboarding_done to profiles so CONNEXA never re-shows the first-login
-- prompt to a user who has already completed it.
-- Gender column is added by 038; this migration only adds the flag.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_done boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.onboarding_done IS
  'Set to TRUE once the user has completed (or intentionally skipped) the first-login profile setup. Gender must be selected before this is ever set.';

NOTIFY pgrst, 'reload schema';

-- Verification
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.profiles'::regclass
      AND attname = 'onboarding_done'
      AND NOT attisdropped
  ) THEN 'onboarding_done column present'
  ELSE 'FAILED - column missing'
END AS migration_040;
