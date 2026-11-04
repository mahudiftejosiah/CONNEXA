-- 015: file sharing in Messages (pictures, video clips, documents).
--
-- Run this in the Supabase dashboard SQL editor after 014_assistant_bot.sql.
-- Adds attachment columns to messages plus a private "chat-files" bucket whose
-- read policy only lets the two people in the thread see the file.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Message attachments
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_kind TEXT
    CHECK (attachment_kind IS NULL OR attachment_kind IN ('image', 'video', 'file')),
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size INT;

-- A message with only a file is still a message, so drop the "must have text"
-- expectation on the check by allowing an empty body explicitly.
ALTER TABLE public.messages ALTER COLUMN content SET DEFAULT '';

-- ---------------------------------------------------------------------------
-- 2. Private storage bucket for chat files
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-files', 'chat-files', FALSE, 104857600, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = 104857600,
  allowed_mime_types = NULL;

-- Upload: only into your own folder (<your-user-id>/...).
DROP POLICY IF EXISTS "chat_files_owner_insert" ON storage.objects;
CREATE POLICY "chat_files_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read: the folder owner (so a sender can render what they just uploaded) or
-- anybody who takes part in the conversation the file was posted to.
DROP POLICY IF EXISTS "chat_files_participant_read" ON storage.objects;
CREATE POLICY "chat_files_participant_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.messages m
        JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
        WHERE m.attachment_url = storage.objects.name
          AND cp.user_id = auth.uid()
      )
    )
  );

-- Update/delete: your own folder only.
DROP POLICY IF EXISTS "chat_files_owner_update" ON storage.objects;
CREATE POLICY "chat_files_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'chat-files' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'chat-files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "chat_files_owner_delete" ON storage.objects;
CREATE POLICY "chat_files_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-files' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify: expects attachment_url | attachment_kind | chat-files | t
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'attachment_url') AS attachment_url,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'attachment_kind') AS attachment_kind,
  (SELECT id FROM storage.buckets WHERE id = 'chat-files') AS bucket,
  (SELECT NOT public FROM storage.buckets WHERE id = 'chat-files') AS is_private;
