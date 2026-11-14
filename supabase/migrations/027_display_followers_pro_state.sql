-- 027_display_followers_pro_state.sql
-- Two things the admin dashboard needs that the schema does not have yet:
--   * a display-only follower number, kept in its own column so the real
--     followers table is never touched,
--   * a PRO expiry the verification tick can lapse against,
-- plus the policy and guard rails those writes require.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_followers BIGINT
    CHECK (display_followers IS NULL OR display_followers >= 0);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.display_followers IS
  'Admin-chosen number printed on the profile. NULL means "show the true follower count".';

-- profiles_update used to be "auth.uid() = id" only. The Verified button and the
-- displayed-follower control both write to somebody else's row, so an admin now
-- qualifies as well.
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- The policy above is deliberately blunt, so the columns are not. A member may
-- change everything about their own profile except the four that decide what
-- they are: admin, verified, PRO expiry and the displayed follower number.
CREATE OR REPLACE FUNCTION public.profiles_guard_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No JWT means a service-role or migration write, which RLS already governs.
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin         IS DISTINCT FROM OLD.is_admin
    OR NEW.is_verified     IS DISTINCT FROM OLD.is_verified
    OR NEW.pro_expires_at  IS DISTINCT FROM OLD.pro_expires_at
    OR NEW.display_followers IS DISTINCT FROM OLD.display_followers THEN
    RAISE EXCEPTION 'Only an administrator may change admin status, verification, PRO expiry or the displayed follower count'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileges ON public.profiles;
CREATE TRIGGER profiles_guard_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileges();

-- Every admin change to a displayed count is written to the audit trail by the
-- dashboard; this index keeps that trail readable per user.
CREATE INDEX IF NOT EXISTS idx_moderation_actions_target_created
  ON public.moderation_actions(target_user_id, created_at DESC);

NOTIFY pgrst, 'reload schema';

-- Verification: the four new pieces of the schema, one row each.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name IN ('display_followers', 'pro_expires_at')) AS new_columns,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update') AS update_policy,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'profiles_guard_privileges') AS guard_trigger;
