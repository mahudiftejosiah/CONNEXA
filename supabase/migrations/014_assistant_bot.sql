-- 014_assistant_bot.sql
-- Admin assistant bot: auto-moderation + admin command console.
--
-- Everything the bot does is gated on a single switch stored in
-- public.site_settings ('bot_enabled'). The switch is read inside the
-- SECURITY DEFINER functions themselves, so turning the bot off in the admin
-- panel stops it at the database level too — not just in the UI.
--
-- Paste this whole file into the Supabase dashboard SQL editor and Run.

-- ============================================================
-- 1) Settings — all three default to OFF / review-only
-- ============================================================
INSERT INTO public.site_settings (key, value)
VALUES
  ('bot_enabled',   'off'),
  ('bot_auto_hide', 'off'),
  ('bot_keywords',  'scam, fraud, impersonation, kill, bomb')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2) Comments need a soft-hide so the bot can undo what it did
--    (posts already have visibility, so a hidden post is just
--    visibility = 'only_me' and needs no new column).
-- ============================================================
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- Hidden comments disappear for everyone except admins. Rebuilt from 005.
DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (
  public.can_view_post(post_id)
  AND (hidden = FALSE OR public.is_admin())
);

-- Admins can now edit comments as well as delete them (was author-only).
DROP POLICY IF EXISTS "comments_update" ON public.comments;
CREATE POLICY "comments_update" ON public.comments FOR UPDATE
  USING (auth.uid() = author_id OR public.is_admin())
  WITH CHECK (auth.uid() = author_id OR public.is_admin());

-- ============================================================
-- 3) Flag queue — one open flag per piece of content
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bot_flags (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type         TEXT NOT NULL CHECK (entity_type IN ('post', 'comment')),
  entity_id           UUID NOT NULL,
  author_id           UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  matched_keyword     TEXT,
  excerpt             TEXT,
  action              TEXT NOT NULL DEFAULT 'flag' CHECK (action IN ('flag', 'hide')),
  previous_visibility TEXT,
  previous_hidden     BOOLEAN,
  open                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  resolved_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bot_flags_open ON public.bot_flags(open, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_flags_entity ON public.bot_flags(entity_type, entity_id);

-- Only one open flag per target, however it was raised.
CREATE UNIQUE INDEX IF NOT EXISTS bot_flags_open_unique
  ON public.bot_flags (entity_type, entity_id)
  WHERE open;

ALTER TABLE public.bot_flags ENABLE ROW LEVEL SECURITY;

-- Admins read the queue; writes only ever happen through the functions below.
DROP POLICY IF EXISTS bot_flags_admin_select ON public.bot_flags;
CREATE POLICY bot_flags_admin_select ON public.bot_flags
  FOR SELECT TO authenticated USING (public.is_admin());

-- ============================================================
-- 4) Helpers that read the switches
-- ============================================================
CREATE OR REPLACE FUNCTION public.bot_setting(p_key TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.site_settings WHERE key = p_key;
$$;

CREATE OR REPLACE FUNCTION public.bot_is_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.bot_setting('bot_enabled') = 'on', FALSE);
$$;

CREATE OR REPLACE FUNCTION public.bot_auto_hide()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.bot_setting('bot_auto_hide') = 'on', FALSE);
$$;

CREATE OR REPLACE FUNCTION public.bot_keyword_list()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT trim(k)
      FROM unnest(string_to_array(public.bot_setting('bot_keywords'), ',')) AS k
      WHERE trim(k) <> ''
    ),
    ARRAY[]::TEXT[]
  );
$$;

REVOKE ALL ON FUNCTION public.bot_setting(TEXT), public.bot_is_enabled(),
  public.bot_auto_hide(), public.bot_keyword_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bot_setting(TEXT), public.bot_is_enabled(),
  public.bot_auto_hide(), public.bot_keyword_list() TO anon, authenticated;

-- ============================================================
-- 5) bot_inspect — the check itself.
--    Called right after a post or comment is published. Returns the flag id
--    when the content matched, NULL otherwise. Never blocks publishing: the
--    app ignores a NULL and treats errors as non-fatal.
-- ============================================================
CREATE OR REPLACE FUNCTION public.bot_inspect(
  p_entity_type TEXT,
  p_entity_id   UUID,
  p_content     TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kw       TEXT;
  v_flag_id  UUID;
  v_hide     BOOLEAN;
  v_prev_vis TEXT;
  v_prev_hid BOOLEAN;
BEGIN
  IF NOT public.bot_is_enabled()
     OR p_content IS NULL
     OR length(trim(p_content)) = 0
     OR p_entity_type NOT IN ('post', 'comment')
     OR p_entity_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT k INTO v_kw
  FROM unnest(public.bot_keyword_list()) AS k
  WHERE p_content ILIKE '%' || k || '%'
  LIMIT 1;

  IF v_kw IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bot_flags
    WHERE entity_type = p_entity_type AND entity_id = p_entity_id AND open
  ) THEN
    RETURN NULL;
  END IF;

  v_hide := public.bot_auto_hide();

  IF p_entity_type = 'post' THEN
    SELECT visibility INTO v_prev_vis FROM public.posts WHERE id = p_entity_id;
    IF v_prev_vis IS NULL THEN RETURN NULL; END IF;
  ELSE
    SELECT hidden INTO v_prev_hid FROM public.comments WHERE id = p_entity_id;
    IF v_prev_hid IS NULL THEN RETURN NULL; END IF;
  END IF;

  INSERT INTO public.bot_flags (
    entity_type, entity_id, author_id, matched_keyword, excerpt,
    action, previous_visibility, previous_hidden
  )
  VALUES (
    p_entity_type, p_entity_id,
    COALESCE(
      (SELECT author_id FROM public.posts WHERE id = p_entity_id),
      (SELECT author_id FROM public.comments WHERE id = p_entity_id)
    ),
    v_kw,
    left(regexp_replace(trim(p_content), '\s+', ' ', 'g'), 160),
    CASE WHEN v_hide THEN 'hide' ELSE 'flag' END,
    v_prev_vis,
    v_prev_hid
  )
  RETURNING id INTO v_flag_id;

  IF v_hide THEN
    IF p_entity_type = 'post' THEN
      UPDATE public.posts SET visibility = 'only_me'
      WHERE id = p_entity_id AND visibility <> 'only_me';
    ELSE
      UPDATE public.comments SET hidden = TRUE WHERE id = p_entity_id;
    END IF;
  END IF;

  RETURN v_flag_id;
END;
$$;

-- ============================================================
-- 6) bot_scan — admin-triggered sweep of recent content.
--    Returns how many new flags were raised.
-- ============================================================
CREATE OR REPLACE FUNCTION public.bot_scan(p_limit INT DEFAULT 25)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        RECORD;
  v_raised INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only.';
  END IF;
  IF NOT public.bot_is_enabled() THEN
    RAISE EXCEPTION 'Assistant bot is switched off.';
  END IF;

  FOR r IN
    SELECT x.entity_type, x.entity_id, x.content
    FROM (
      SELECT 'post'::TEXT AS entity_type, po.id AS entity_id, po.content, po.created_at
      FROM public.posts po
      WHERE po.created_at > now() - interval '30 days'
        AND EXISTS (SELECT 1 FROM unnest(public.bot_keyword_list()) AS k
                    WHERE po.content ILIKE '%' || k || '%')
        AND NOT EXISTS (SELECT 1 FROM public.bot_flags f
                        WHERE f.entity_type = 'post' AND f.entity_id = po.id AND f.open)
      UNION ALL
      SELECT 'comment', co.id, co.content, co.created_at
      FROM public.comments co
      WHERE co.created_at > now() - interval '30 days'
        AND co.hidden = FALSE
        AND EXISTS (SELECT 1 FROM unnest(public.bot_keyword_list()) AS k
                    WHERE co.content ILIKE '%' || k || '%')
        AND NOT EXISTS (SELECT 1 FROM public.bot_flags f
                        WHERE f.entity_type = 'comment' AND f.entity_id = co.id AND f.open)
      ORDER BY created_at DESC
    ) x
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 200))
  LOOP
    IF public.bot_inspect(r.entity_type, r.entity_id, r.content) IS NOT NULL THEN
      v_raised := v_raised + 1;
    END IF;
  END LOOP;

  RETURN v_raised;
END;
$$;

-- ============================================================
-- 7) bot_hide / bot_restore — the two ways a flag gets closed out.
--    Both are admin-only. Restore also works while the bot is switched off,
--    so an admin can always hand back something the bot took down.
-- ============================================================
CREATE OR REPLACE FUNCTION public.bot_hide(p_flag_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f public.bot_flags%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only.';
  END IF;

  SELECT * INTO f FROM public.bot_flags WHERE id = p_flag_id;
  IF f.id IS NULL THEN
    RAISE EXCEPTION 'Flag not found.';
  END IF;
  IF NOT f.open THEN
    RAISE EXCEPTION 'That flag is already closed.';
  END IF;

  IF f.entity_type = 'post' THEN
    UPDATE public.posts SET visibility = 'only_me'
    WHERE id = f.entity_id AND visibility <> 'only_me';
  ELSE
    UPDATE public.comments SET hidden = TRUE WHERE id = f.entity_id;
  END IF;

  UPDATE public.bot_flags SET action = 'hide' WHERE id = p_flag_id;

  INSERT INTO public.moderation_actions (
    admin_id, target_user_id, entity_id, entity_type, action, reason
  )
  VALUES (
    auth.uid(), f.author_id, f.entity_id, f.entity_type,
    'assistant_bot_hide',
    'Hidden by assistant bot (keyword: ' || COALESCE(f.matched_keyword, '-') || ')'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bot_restore(p_flag_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f public.bot_flags%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only.';
  END IF;

  SELECT * INTO f FROM public.bot_flags WHERE id = p_flag_id;
  IF f.id IS NULL THEN
    RAISE EXCEPTION 'Flag not found.';
  END IF;
  IF NOT f.open THEN
    RAISE EXCEPTION 'That flag is already closed.';
  END IF;

  IF f.action = 'hide' THEN
    IF f.entity_type = 'post' THEN
      UPDATE public.posts SET visibility = COALESCE(f.previous_visibility, 'public')
      WHERE id = f.entity_id;
    ELSE
      UPDATE public.comments SET hidden = COALESCE(f.previous_hidden, FALSE)
      WHERE id = f.entity_id;
    END IF;
  END IF;

  UPDATE public.bot_flags
  SET open = FALSE, resolved_at = NOW(), resolved_by = auth.uid()
  WHERE id = p_flag_id;

  INSERT INTO public.moderation_actions (
    admin_id, target_user_id, entity_id, entity_type, action, reason
  )
  VALUES (
    auth.uid(), f.author_id, f.entity_id, f.entity_type,
    'assistant_bot_restore',
    'Restored by admin from the assistant bot console'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bot_inspect(TEXT, UUID, TEXT),
  public.bot_scan(INT), public.bot_hide(UUID), public.bot_restore(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bot_inspect(TEXT, UUID, TEXT),
  public.bot_scan(INT), public.bot_hide(UUID), public.bot_restore(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 8) Make the new table and functions visible to the API right away,
--    then verify — every line should read off / 0 / false.
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

select
  (select value from public.site_settings where key = 'bot_enabled')   as bot_enabled,
  (select value from public.site_settings where key = 'bot_auto_hide') as bot_auto_hide,
  (select count(*) from public.bot_flags where open)                   as open_flags,
  public.bot_is_enabled()                                              as is_enabled;
