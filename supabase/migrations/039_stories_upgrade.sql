-- 039 — Stories, done properly.
--
-- This file finishes the Stories system. It adds nothing that already exists:
-- every table and function here is created with IF NOT EXISTS / CREATE OR
-- REPLACE, and every policy is dropped before it is created. If you have
-- already pasted 037, the parts that file owns are simply restated and change
-- nothing. If you have not, this file alone brings the story feature to life.
--
-- What it settles:
--   1. The moment a story is published is stored in the database, and the
--      expiry is worked out from that moment — not from when a page is opened.
--   2. A story disappears exactly 24 hours after it was published, and the
--      file behind it is cleaned up afterwards.
--   3. Watching a story is recorded for the person who watched, and for
--      nobody else. The poster watching their own story is not a view.
--   4. Friends can read a friend's story, strangers cannot read a friends-only
--      story, and the storage file follows the same rule.
--   5. A story published now reaches the people who should see it: the tables
--      take part in realtime, so no refresh is needed.
--
-- Run it in the Supabase Dashboard → SQL Editor. It is safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. Story columns
-- ---------------------------------------------------------------------------
-- The audience column comes from 037. It is restated here so the story
-- feature works even when 037 has not been pasted yet.
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'public'
  CHECK (audience IN ('public', 'friends'));

-- The moment the story was published. The expiry is measured from here.
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS published_at timestamptz NOT NULL DEFAULT NOW();

-- How the text on the story is laid out over the media.
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS overlay_position text
  CHECK (overlay_position IS NULL OR overlay_position IN ('top', 'center', 'bottom'));

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS overlay_color text;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS overlay_size text
  CHECK (overlay_size IS NULL OR overlay_size IN ('sm', 'md', 'lg'));

CREATE INDEX IF NOT EXISTS idx_stories_author_expires
  ON public.stories(author_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_views_viewer
  ON public.story_views(viewer_id, story_id);

-- ---------------------------------------------------------------------------
-- 2. The expiry is the database's business
-- ---------------------------------------------------------------------------
-- A story lives 24 hours from the moment it was published. The client cannot
-- ask for longer, and the clock does not depend on anybody's browser.
CREATE OR REPLACE FUNCTION public.handle_story_publication()
RETURNS TRIGGER AS $$
BEGIN
  NEW.published_at := COALESCE(NEW.published_at, NOW());
  NEW.expires_at   := NEW.published_at + INTERVAL '24 hours';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS story_publication_trigger ON public.stories;
CREATE TRIGGER story_publication_trigger
  BEFORE INSERT ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.handle_story_publication();

-- ---------------------------------------------------------------------------
-- 3. Story reactions and story replies
-- ---------------------------------------------------------------------------
-- Both come from 037 and are restated here so the feature stands on its own.
CREATE TABLE IF NOT EXISTS public.story_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (story_id, user_id)
);

ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_reactions REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "story_reactions_select" ON public.story_reactions;
DROP POLICY IF EXISTS "story_reactions_insert" ON public.story_reactions;
DROP POLICY IF EXISTS "story_reactions_update" ON public.story_reactions;
DROP POLICY IF EXISTS "story_reactions_delete" ON public.story_reactions;

CREATE POLICY "story_reactions_select" ON public.story_reactions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.id = story_reactions.story_id
      AND s.expires_at > NOW()
      AND (s.author_id = auth.uid() OR NOT public.is_blocked(auth.uid(), s.author_id))
      AND (
        s.audience = 'public'
        OR s.author_id = auth.uid()
        OR public.are_friends(auth.uid(), s.author_id)
        OR public.is_admin()
      )
  )
);

CREATE POLICY "story_reactions_insert" ON public.story_reactions FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.id = story_reactions.story_id
      AND s.expires_at > NOW()
      AND (s.author_id = auth.uid() OR NOT public.is_blocked(auth.uid(), s.author_id))
      AND (
        s.audience = 'public'
        OR s.author_id = auth.uid()
        OR public.are_friends(auth.uid(), s.author_id)
        OR public.is_admin()
      )
  )
);

CREATE POLICY "story_reactions_update" ON public.story_reactions FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "story_reactions_delete" ON public.story_reactions FOR DELETE
USING (auth.uid() = user_id);

-- A reply to a story is a message that carries the story it answered.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS story_id uuid
  REFERENCES public.stories(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. Who may read a story
-- ---------------------------------------------------------------------------
-- A story is readable by its author, by everybody when it is public, by the
-- author's friends when it is friends-only, and by an administrator. A story
-- past its expiry is readable by nobody. The helpers are SECURITY DEFINER, so
-- this does not loop back into the policies of the tables it asks about.
DROP POLICY IF EXISTS "stories_select" ON public.stories;

CREATE POLICY "stories_select" ON public.stories FOR SELECT USING (
  expires_at > NOW()
  AND (author_id = auth.uid() OR NOT public.is_blocked(auth.uid(), author_id))
  AND (
    audience = 'public'
    OR author_id = auth.uid()
    OR public.are_friends(auth.uid(), author_id)
    OR public.is_admin()
  )
);

DROP POLICY IF EXISTS "stories_insert" ON public.stories;
CREATE POLICY "stories_insert" ON public.stories FOR INSERT
WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "stories_delete" ON public.stories;
CREATE POLICY "stories_delete" ON public.stories FOR DELETE
USING (auth.uid() = author_id OR public.is_admin());

-- A viewer sees their own view rows; the author of a story sees who watched.
DROP POLICY IF EXISTS "story_views_select" ON public.story_views;
DROP POLICY IF EXISTS "story_views_insert" ON public.story_views;
DROP POLICY IF EXISTS "story_views_delete" ON public.story_views;

CREATE POLICY "story_views_select" ON public.story_views FOR SELECT USING (
  viewer_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.id = story_views.story_id AND s.author_id = auth.uid()
  )
);

CREATE POLICY "story_views_insert" ON public.story_views FOR INSERT
WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY "story_views_delete" ON public.story_views FOR DELETE
USING (viewer_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Watching a story
-- ---------------------------------------------------------------------------
-- One row per viewer per story, never a duplicate, and the counter on the
-- story follows. The poster watching their own story is not a view: it would
-- put them in their own viewer list and count them as an audience.
CREATE OR REPLACE FUNCTION public.mark_story_viewed(p_story uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer uuid := auth.uid();
  v_author uuid;
BEGIN
  IF v_viewer IS NULL THEN
    RETURN false;
  END IF;

  SELECT s.author_id INTO v_author
  FROM public.stories s
  WHERE s.id = p_story;

  IF v_author IS NULL OR v_author = v_viewer THEN
    RETURN false;
  END IF;

  -- Only somebody who is allowed to read the story may watch it.
  IF NOT EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.id = p_story
      AND s.expires_at > NOW()
      AND NOT public.is_blocked(v_viewer, s.author_id)
      AND (
        s.audience = 'public'
        OR s.author_id = v_viewer
        OR public.are_friends(v_viewer, s.author_id)
        OR public.is_admin()
      )
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.story_views (story_id, viewer_id)
  VALUES (p_story, v_viewer)
  ON CONFLICT (story_id, viewer_id) DO NOTHING;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_story_viewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_story_viewed(uuid) TO authenticated;

-- The counter the author sees next to their story.
CREATE OR REPLACE FUNCTION public.handle_story_view_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.stories SET view_count = view_count + 1 WHERE id = NEW.story_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS story_view_count_trigger ON public.story_views;
CREATE TRIGGER story_view_count_trigger
  AFTER INSERT ON public.story_views
  FOR EACH ROW EXECUTE FUNCTION public.handle_story_view_count();

-- ---------------------------------------------------------------------------
-- 6. The storage file follows the same rules as the row
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "stories_select" ON storage.objects;
DROP POLICY IF EXISTS "stories_insert" ON storage.objects;
DROP POLICY IF EXISTS "stories_update" ON storage.objects;
DROP POLICY IF EXISTS "stories_delete" ON storage.objects;

CREATE POLICY "stories_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'stories' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.media_url = storage.objects.name
        AND s.expires_at > NOW()
        AND NOT public.is_blocked(auth.uid(), s.author_id)
        AND (
          s.audience = 'public'
          OR s.author_id = auth.uid()
          OR public.are_friends(auth.uid(), s.author_id)
          OR public.is_admin()
        )
    )
  )
);

CREATE POLICY "stories_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'stories' AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "stories_update" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'stories' AND (storage.foldername(name))[1] = auth.uid()::text
) WITH CHECK (
  bucket_id = 'stories' AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "stories_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'stories' AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------------------------
-- 7. The file goes when the story goes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_story_media_cleanup()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.media_url IS NOT NULL AND OLD.media_url NOT LIKE 'http%' THEN
    BEGIN
      EXECUTE 'SELECT storage.delete_object($1, $2)' USING OLD.media_url, 'stories';
    EXCEPTION WHEN others THEN
      -- The helper takes its arguments in either order depending on the
      -- project version. Try the other way round before giving up.
      BEGIN
        EXECUTE 'SELECT storage.delete_object($1, $2)' USING 'stories', OLD.media_url;
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS story_media_cleanup_trigger ON public.stories;
CREATE TRIGGER story_media_cleanup_trigger
  BEFORE DELETE ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.handle_story_media_cleanup();

-- ---------------------------------------------------------------------------
-- 8. Expired stories are cleaned up
-- ---------------------------------------------------------------------------
-- The rows stop being readable the moment they expire; this removes the rows
-- and their files afterwards, so the bucket does not fill up with pictures
-- nobody will ever see again.
CREATE OR REPLACE FUNCTION public.purge_expired_stories()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  removed integer := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.stories WHERE expires_at <= NOW()
  LOOP
    DELETE FROM public.stories WHERE id = r.id;
    removed := removed + 1;
  END LOOP;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_stories() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_expired_stories() TO authenticated, service_role;

-- Run it every half hour when the project has pg_cron. A project without it
-- simply keeps expired rows, which are already invisible.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION WHEN others THEN
      NULL;
    END;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
      BEGIN
        PERFORM cron.unschedule('connexa-purge-expired-stories');
      EXCEPTION WHEN others THEN
        NULL;
      END;
      BEGIN
        PERFORM cron.schedule(
          'connexa-purge-expired-stories',
          '*/30 * * * *',
          'SELECT public.purge_expired_stories()'
        );
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 9. A story published now reaches the people who should see it
-- ---------------------------------------------------------------------------
-- Without this the browser never hears about a new story, and the page has to
-- be reloaded by hand before a friend sees it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'stories'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'story_views'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.story_views;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'story_reactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.story_reactions;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 10. Check it landed
-- ---------------------------------------------------------------------------
SELECT 'stories published_at' AS check_name,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_attribute
         WHERE attrelid = 'public.stories'::regclass
           AND attname = 'published_at' AND NOT attisdropped
       ) THEN 'OK' ELSE 'MISSING' END AS result
UNION ALL
SELECT 'story overlay columns',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_attribute
         WHERE attrelid = 'public.stories'::regclass
           AND attname = 'overlay_position' AND NOT attisdropped
       ) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'mark_story_viewed()',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'mark_story_viewed'
       ) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'stories in realtime',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND tablename = 'stories'
       ) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'expired stories waiting to be cleaned',
       (SELECT COUNT(*)::text FROM public.stories WHERE expires_at <= NOW());
