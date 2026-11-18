-- 035: PRO subscription plans, shared by the admin console and the admin bot.
--
-- Run this in the Supabase dashboard SQL editor after 034.
-- One table, two front doors: the Plans panel under Admin → PRO and the
-- `pro plan …` bot commands read and write exactly these rows.
-- Nothing is seeded — an administrator publishes the first real plan.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pro_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  duration_days INT NOT NULL DEFAULT 30 CHECK (duration_days > 0 AND duration_days <= 3650),
  blurb TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_pro_plans()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pro_plans_touch ON public.pro_plans;
CREATE TRIGGER pro_plans_touch BEFORE UPDATE ON public.pro_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_pro_plans();

ALTER TABLE public.pro_plans ENABLE ROW LEVEL SECURITY;

-- Everyone may read the published plans; only an administrator may change them.
DROP POLICY IF EXISTS pro_plans_read ON public.pro_plans;
CREATE POLICY pro_plans_read ON public.pro_plans
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS pro_plans_admin_write ON public.pro_plans;
CREATE POLICY pro_plans_admin_write ON public.pro_plans
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify: expects pro_plans | t
SELECT
  (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pro_plans') AS pro_plans,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'pro_plans') AS rls_on;