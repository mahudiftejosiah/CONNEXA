-- 038: profile gender
--
-- Gender is a plain self-description, like bio or website. The BEFORE UPDATE
-- trigger from migration 027 only refuses the four columns that decide what a
-- person *is* (is_admin, is_verified, pro_expires_at, display_followers), so a
-- new column on profiles is user-editable the moment it exists. No policy and
-- no trigger change is needed here.
--
-- NULL means "never chose one". CONNEXA keeps showing that person their initials
-- avatar instead of guessing a silhouette, so every existing account looks
-- exactly as it did before this paste.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text
  CHECK (gender IN ('male', 'female', 'other'));

COMMENT ON COLUMN public.profiles.gender IS
  'Self-described gender: male, female or other. NULL = never chosen. Drives the default avatar silhouette.';

NOTIFY pgrst, 'reload schema';

-- Verification: run this and expect one row with "gender column present".
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.profiles'::regclass
      AND attname = 'gender'
      AND NOT attisdropped
  ) THEN 'gender column present'
  ELSE 'FAILED - column missing'
END AS migration_038;
