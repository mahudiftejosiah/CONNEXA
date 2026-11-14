-- 028_hashing_bot_usage.sql
-- The hashing bot keeps no record of what it hashed. This table only says that
-- an operation of a given kind happened with a given algorithm, which is what
-- the admin's usage panel counts.

CREATE TABLE IF NOT EXISTS public.hashing_usage (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode       TEXT NOT NULL CHECK (mode IN ('generate', 'identify', 'verify', 'revert')),
  algorithm  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hashing_usage_created ON public.hashing_usage(created_at DESC);

ALTER TABLE public.hashing_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hashing_usage_insert" ON public.hashing_usage;
CREATE POLICY "hashing_usage_insert" ON public.hashing_usage FOR INSERT
  TO authenticated WITH CHECK (true);

-- Only administrators ever read it back.
DROP POLICY IF EXISTS "hashing_usage_select" ON public.hashing_usage;
CREATE POLICY "hashing_usage_select" ON public.hashing_usage FOR SELECT
  TO authenticated USING (public.is_admin());

NOTIFY pgrst, 'reload schema';

SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hashing_usage') AS columns,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hashing_usage') AS policies;
