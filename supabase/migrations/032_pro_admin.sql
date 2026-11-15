-- ============================================================
-- CONNEXA 032 — CONNEXA PRO: administrator rights
--
-- Two things the PRO console needs and the earlier migrations did
-- not grant: an admin may end somebody else's broadcast, and an
-- administrator may allow or block one account from going live
-- without touching that account's membership.
--
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- ============================================================
BEGIN;

-- ---------- Per-account streaming permission ----------
-- Absence means allowed, so this table only ever holds exceptions and
-- nobody has to be inserted anywhere before they can stream.
CREATE TABLE IF NOT EXISTS public.stream_permissions (
  user_id    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  allowed    BOOLEAN NOT NULL DEFAULT TRUE,
  note       TEXT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stream_permissions ENABLE ROW LEVEL SECURITY;

-- Members are never told they are blocked by reading this table; the insert
-- policy below refuses them, and only an admin can list the exceptions.
DROP POLICY IF EXISTS "stream_permissions_admin" ON public.stream_permissions;
CREATE POLICY "stream_permissions_admin" ON public.stream_permissions FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.stream_allowed(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT allowed FROM stream_permissions WHERE user_id = p_user),
    TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION public.stream_allowed(UUID) TO authenticated;

-- Broadcasting still requires PRO plus the live_streaming switch (migration
-- 029), and now also that the account has not been blocked here.
DROP POLICY IF EXISTS "live_insert" ON public.live_sessions;
CREATE POLICY "live_insert" ON public.live_sessions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_pro(auth.uid(), 'live_streaming')
    AND public.stream_allowed(auth.uid())
  );

-- Ending a stream: the broadcaster always may, an administrator now may too.
DROP POLICY IF EXISTS "live_update" ON public.live_sessions;
CREATE POLICY "live_update" ON public.live_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify: expects yes | yes | yes
SELECT
  (SELECT CASE WHEN to_regclass('public.stream_permissions') IS NOT NULL THEN 'yes' ELSE 'no' END) AS permissions_table,
  (SELECT CASE WHEN to_regprocedure('public.stream_allowed(uuid)') IS NOT NULL THEN 'yes' ELSE 'no' END) AS helper_function,
  (SELECT count(*) = 2 FROM pg_policies WHERE tablename = 'live_sessions'
     AND policyname IN ('live_insert','live_update')) AS live_policies;
