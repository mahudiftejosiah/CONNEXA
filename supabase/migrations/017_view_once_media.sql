-- 017: view-once media in Messages.
--
-- Run this in the Supabase dashboard SQL editor after 016_credits_sources.sql.
--
-- Chat files already live in the private "chat-files" bucket, but migration 015
-- hands both people in a thread a six-hour signed URL the moment the thread
-- opens. A view-once message must not work like that, so this migration makes
-- three changes:
--   * a recipient cannot read a view-once file at all before it is opened, and
--     keeps access for only two minutes after the tap — long enough to render it
--     and survive a refresh, far too short for the link to be useful later;
--   * only public.open_view_once() starts that clock, and only the recipient may
--     call it, so the sender cannot un-open their own message and a recipient
--     cannot reset the flag once it has run;
--   * a trigger freezes both columns against ordinary client updates.
-- The sender keeps normal access to their own upload — they chose to send it.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Two new columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS view_once boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

-- View-once only makes sense for a file, and the clock only runs once opened.
DO $$ BEGIN
  ALTER TABLE public.messages
    ADD CONSTRAINT messages_view_once_needs_file
    CHECK (view_once = FALSE OR attachment_url IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.messages
    ADD CONSTRAINT messages_viewed_needs_view_once
    CHECK (viewed_at IS NULL OR view_once = TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_view_once_unopened
  ON public.messages (viewed_at)
  WHERE view_once = TRUE AND viewed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Ordinary client updates may not touch the view-once columns
-- ---------------------------------------------------------------------------
-- messages_update (007) lets any participant write the row, which would allow a
-- recipient to rewind their own view. The helper function sets a
-- transaction-local flag that releases this guard; nothing else can.
CREATE OR REPLACE FUNCTION public.guard_view_once()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(current_setting('connexa.view_once_open', TRUE), '') = 'on' THEN
    RETURN NEW;
  END IF;
  NEW.view_once := OLD.view_once;
  NEW.viewed_at := OLD.viewed_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_guard_view_once ON public.messages;
CREATE TRIGGER messages_guard_view_once
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_view_once();

-- ---------------------------------------------------------------------------
-- 3. Opening a view-once message
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_view_once(p_message_id UUID)
RETURNS TABLE (attachment_path TEXT, media_kind TEXT, ttl_seconds INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.messages%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.messages WHERE id = p_message_id;

  IF NOT FOUND OR m.view_once IS NOT TRUE OR m.attachment_url IS NULL THEN
    RAISE EXCEPTION 'not a view-once message';
  END IF;
  IF m.sender_id = auth.uid() THEN
    RAISE EXCEPTION 'you sent this message';
  END IF;
  IF NOT public.is_conversation_participant(m.conversation_id) THEN
    RAISE EXCEPTION 'not your conversation';
  END IF;

  -- First tap starts the clock; a later tap inside the window is allowed so a
  -- refresh mid-view still shows the file. After that it is closed for good.
  IF m.viewed_at IS NOT NULL AND m.viewed_at < now() - interval '2 minutes' THEN
    RAISE EXCEPTION 'this message has already been opened';
  END IF;

  IF m.viewed_at IS NULL THEN
    PERFORM set_config('connexa.view_once_open', 'on', TRUE);
    UPDATE public.messages SET viewed_at = now() WHERE id = p_message_id;
  END IF;

  RETURN QUERY SELECT m.attachment_url, m.attachment_kind, 60;
END;
$$;

REVOKE ALL ON FUNCTION public.open_view_once(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_view_once(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.open_view_once(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. A view-once file is readable by the recipient only while it is on screen
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "chat_files_participant_read" ON storage.objects;
CREATE POLICY "chat_files_participant_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND (
      -- uploaders always keep their own copy
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.messages m
        WHERE m.attachment_url = storage.objects.name
          AND public.is_conversation_participant(m.conversation_id)
          AND m.sender_id <> auth.uid()
          AND (
            m.view_once IS NOT TRUE
            OR (m.viewed_at IS NOT NULL AND m.viewed_at > now() - interval '2 minutes')
          )
      )
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify: expects 2 | true | true | 1
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'messages'
       AND column_name IN ('view_once', 'viewed_at')) AS view_once_columns,
  (to_regprocedure('public.open_view_once(uuid)') IS NOT NULL) AS rpc_exists,
  (to_regclass('public.messages') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_trigger t
                   JOIN pg_class c ON c.oid = t.tgrelid
                  WHERE t.tgname = 'messages_guard_view_once' AND c.relname = 'messages')) AS guard_trigger,
  (SELECT COUNT(*) FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'chat_files_participant_read') AS read_policy;
