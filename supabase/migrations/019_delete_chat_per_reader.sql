-- ============================================================
-- 019 — Deleting a chat, per reader
-- ============================================================
-- Messenger lets you clear a conversation out of your inbox without touching
-- the other person's copy. That is a marker on YOUR row in
-- conversation_participants, not a DELETE: the thread itself stays so the peer
-- keeps reading it, and a new message from them brings it back for you.
--
-- No new RLS policy is needed — writing this column goes through the existing
-- conv_participants_update policy, which already allows a reader to update
-- their own participant row.
--
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

BEGIN;

ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- The inbox asks "my rows that are still in front of me", newest first.
CREATE INDEX IF NOT EXISTS idx_conv_participants_user_undeleted
  ON public.conversation_participants (user_id, deleted_at);

-- The header badge must stop counting a thread you deleted, or the number
-- would point at chats the inbox no longer shows.
CREATE OR REPLACE FUNCTION public.unread_message_count(p_user UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)
  FROM public.messages m
  JOIN public.conversation_participants cp
    ON cp.conversation_id = m.conversation_id
  WHERE cp.user_id = p_user
    AND p_user = auth.uid()          -- only ever counts your own inbox
    AND cp.deleted_at IS NULL        -- never counts chats you have deleted
    AND m.sender_id <> p_user
    AND m.is_read = FALSE;
$$;

REVOKE ALL ON FUNCTION public.unread_message_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unread_message_count(UUID) TO authenticated;

-- The header of this file promises that a new message brings the chat back.
-- Without this it would not: the sender's own RLS rights stop them touching
-- your participant row, so the thread would stay hidden and its messages
-- unread and uncounted — silence where a message actually arrived.
--
-- SECURITY DEFINER is deliberate and narrow. Nothing takes user input, the
-- column it writes has one possible value, and the trigger only fires for a
-- message insert that already passed messages_insert, which itself requires the
-- sender to be a participant of that conversation.
CREATE OR REPLACE FUNCTION public.undelete_chat_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.conversation_id IS NOT NULL AND NEW.sender_id IS NOT NULL THEN
    UPDATE public.conversation_participants
    SET deleted_at = NULL
    WHERE conversation_id = NEW.conversation_id
      AND user_id <> NEW.sender_id
      AND deleted_at IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- A trigger function cannot be called from SQL at all — it only answers to a
-- trigger, and its one effect is bounded by the insert that already passed
-- messages_insert. So EXECUTE is granted rather than revoked: some PostgreSQL
-- builds do check the function ACL when a trigger fires, and a revoked grant
-- would then silence every message insert in the site.
GRANT EXECUTE ON FUNCTION public.undelete_chat_on_message() TO authenticated;

DROP TRIGGER IF EXISTS undelete_chat_on_message ON public.messages;
CREATE TRIGGER undelete_chat_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.undelete_chat_on_message();

COMMIT;

-- Check it landed:
SELECT count(*) AS participants, count(deleted_at) AS already_deleted
FROM public.conversation_participants;
