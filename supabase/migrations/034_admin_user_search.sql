-- 034: search every registered account from the admin panel, email included.
--
-- Run this in the Supabase dashboard SQL editor after 033.
-- Email lives in auth.users, which the browser is never allowed to read, so the
-- lookup is one SECURITY DEFINER function that refuses everybody but an admin.
-- It returns only ids and addresses; the panel reads the profile rows itself,
-- so this keeps working whatever optional profile columns a database has.
-- Nothing here changes the newest-accounts rail on /admin.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_find_users(
  p_term TEXT,
  p_page INT DEFAULT 1,
  p_size INT DEFAULT 20
)
RETURNS TABLE (id UUID, email TEXT, total_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_term  TEXT := left(btrim(coalesce(p_term, '')), 120);
  v_like  TEXT;
  v_uuid  UUID := NULL;
  v_size  INT := greatest(1, least(100, coalesce(p_size, 20)));
  v_off   INT := greatest(0, coalesce(p_page, 1) - 1) * v_size;
  v_total BIGINT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;

  IF length(v_term) < 2 THEN
    RETURN;
  END IF;

  v_like := '%' || replace(replace(v_term, '%', '\%'), '_', '\_') || '%';

  -- A full uuid is looked up exactly; anything shorter is a fragment match.
  BEGIN
    v_uuid := v_term::UUID;
  EXCEPTION WHEN others THEN
    v_uuid := NULL;
  END;

  SELECT count(*) INTO v_total
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.username ILIKE v_like
     OR p.display_name ILIKE v_like
     OR u.email ILIKE v_like
     OR (v_uuid IS NOT NULL AND p.id = v_uuid)
     OR (v_uuid IS NULL AND p.id::text ILIKE v_like);

  RETURN QUERY
  SELECT p.id, u.email::TEXT, v_total
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.username ILIKE v_like
     OR p.display_name ILIKE v_like
     OR u.email ILIKE v_like
     OR (v_uuid IS NOT NULL AND p.id = v_uuid)
     OR (v_uuid IS NULL AND p.id::text ILIKE v_like)
  ORDER BY p.created_at DESC
  LIMIT v_size OFFSET v_off;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_find_users(TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_find_users(TEXT, INT, INT) TO authenticated;

-- Matching thousands of accounts stays cheap with these two.
CREATE INDEX IF NOT EXISTS profiles_username_lower ON public.profiles (lower(username));
CREATE INDEX IF NOT EXISTS profiles_display_name_lower ON public.profiles (lower(display_name));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify: expects admin_find_users | t
SELECT
  (SELECT proname FROM pg_proc WHERE proname = 'admin_find_users' LIMIT 1) AS admin_find_users,
  (SELECT prosecdef FROM pg_proc WHERE proname = 'admin_find_users' LIMIT 1) AS security_definer;