-- 022: live broadcasting (Facebook-style "Go live" on a profile cover).
--
-- Run this in the Supabase dashboard SQL editor after 021_credit_wikipedia.sql.
--
-- A broadcast is not a stream: the broadcaster's browser records 5-second
-- clips, uploads each one to the "live" bucket and points the session row at
-- the newest clip. Anyone watching pulls that clip and moves to the next as it
-- lands, which is a few seconds behind real time without needing a streaming
-- server or a realtime subscription.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The session row
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.live_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  -- Newest uploaded clip, so one read of this row is enough to start playing.
  clip_seq    INT  NOT NULL DEFAULT 0,
  clip_path   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS live_sessions_user_status
  ON public.live_sessions (user_id, status);

-- A person is either live or not: never two open sessions at once.
CREATE UNIQUE INDEX IF NOT EXISTS live_sessions_one_open
  ON public.live_sessions (user_id) WHERE status = 'live';

DROP TRIGGER IF EXISTS live_sessions_updated_at ON public.live_sessions;
CREATE TRIGGER live_sessions_updated_at
  BEFORE UPDATE ON public.live_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

-- Everybody sees an open session (that is what puts LIVE on a cover); the
-- owner and admins also see their own broadcast history.
DROP POLICY IF EXISTS "live_read" ON public.live_sessions;
CREATE POLICY "live_read" ON public.live_sessions
  FOR SELECT TO public
  USING (status = 'live' OR user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "live_insert" ON public.live_sessions;
CREATE POLICY "live_insert" ON public.live_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- The broadcaster updates their own row: every clip upload, and the end.
DROP POLICY IF EXISTS "live_update" ON public.live_sessions;
CREATE POLICY "live_update" ON public.live_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "live_delete" ON public.live_sessions;
CREATE POLICY "live_delete" ON public.live_sessions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- Row updates carry the old record too, so a viewer that missed the moment the
-- session flipped to 'ended' can still read it out of the event.
ALTER TABLE public.live_sessions REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Rolling clip bucket
-- ---------------------------------------------------------------------------
-- Public read so a viewer's <video> can play a clip straight from the URL;
-- writes stay locked to the broadcaster's own folder (<user-id>/<session>/…).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('live', 'live', TRUE, 26214400, ARRAY['video/webm'])
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY['video/webm'];

DROP POLICY IF EXISTS "live_clip_insert" ON storage.objects;
CREATE POLICY "live_clip_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'live'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "live_clip_delete" ON storage.objects;
CREATE POLICY "live_clip_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'live'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify: expects live_sessions | live | t | one-open index | 1
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'live_sessions') AS live_sessions,
  (SELECT id FROM storage.buckets WHERE id = 'live') AS bucket,
  (SELECT public FROM storage.buckets WHERE id = 'live') AS is_public,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'live_sessions' AND indexname = 'live_sessions_one_open') AS one_open,
  (SELECT COUNT(*) FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'live_sessions') AS in_realtime;
