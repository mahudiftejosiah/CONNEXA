-- 023: message actions in a chat — reply, edit, forward, pin and unsend.
--
-- Run this in the Supabase dashboard SQL editor after 022_live_sessions.sql.
--
-- messages_update (007) lets every participant write the whole row, which was
-- harmless while the only update was marking messages read. Once a bubble can
-- be edited, deleted or pinned, that same policy would let a reader rewrite
-- words someone else sent. This migration adds the columns the actions need and
-- then closes that door with a trigger, the same way 017 froze the view-once
-- columns: a reader's update still succeeds, it just cannot change the body of
-- another person's message.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to      UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forwarded_from UUID REFERENCES public.messages(id) ON DELETE SET NULL;

-- A thread asks "what is pinned here?" every time it opens, and there is
-- normally at most one answer.
CREATE INDEX IF NOT EXISTS idx_messages_pinned
  ON public.messages (conversation_id)
  WHERE pinned_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Only the sender may change what their message says
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_message_body()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Unchanged body, or only read/pin flags moving: nothing to protect.
  IF NEW.content          IS NOT DISTINCT FROM OLD.content
     AND NEW.sender_id    IS NOT DISTINCT FROM OLD.sender_id
     AND NEW.created_at   IS NOT DISTINCT FROM OLD.created_at
     AND NEW.attachment_url  IS NOT DISTINCT FROM OLD.attachment_url
     AND NEW.attachment_kind IS NOT DISTINCT FROM OLD.attachment_kind
     AND NEW.attachment_name IS NOT DISTINCT FROM OLD.attachment_name
     AND NEW.attachment_size IS NOT DISTINCT FROM OLD.attachment_size
     AND NEW.reply_to      IS NOT DISTINCT FROM OLD.reply_to
     AND NEW.forwarded_from IS NOT DISTINCT FROM OLD.forwarded_from
     AND NEW.edited_at     IS NOT DISTINCT FROM OLD.edited_at
     AND NEW.deleted_at    IS NOT DISTINCT FROM OLD.deleted_at THEN
    RETURN NEW;
  END IF;

  IF OLD.sender_id IS NOT DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  -- A reader tried to rewrite the message. Put every body column back, and let
  -- the columns they are genuinely allowed to set (is_read, pinned_*) stand.
  NEW.content          := OLD.content;
  NEW.sender_id        := OLD.sender_id;
  NEW.created_at       := OLD.created_at;
  NEW.attachment_url   := OLD.attachment_url;
  NEW.attachment_kind  := OLD.attachment_kind;
  NEW.attachment_name  := OLD.attachment_name;
  NEW.attachment_size  := OLD.attachment_size;
  NEW.reply_to         := OLD.reply_to;
  NEW.forwarded_from   := OLD.forwarded_from;
  NEW.edited_at        := OLD.edited_at;
  NEW.deleted_at       := OLD.deleted_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_guard_body ON public.messages;
CREATE TRIGGER messages_guard_body
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_message_body();

-- The same rule for the one destructive thing a non-sender could otherwise do
-- from the client. This runs as the function owner, but the trigger inside it
-- still sees auth.uid() as the caller, so the sender check is not bypassed.
CREATE OR REPLACE FUNCTION public.delete_message_for_everyone(p_message_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.messages%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.messages WHERE id = p_message_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Only the sender, inside their own thread, and never twice.
  IF m.sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'you did not send that message';
  END IF;
  IF NOT public.is_conversation_participant(m.conversation_id) THEN
    RAISE EXCEPTION 'not your conversation';
  END IF;
  IF m.deleted_at IS NOT NULL THEN RETURN TRUE; END IF;

  -- The view-once pair is left alone on purpose: 017's trigger freezes those
  -- columns against ordinary updates, and a deleted bubble never shows media.
  UPDATE public.messages
     SET deleted_at = now(),
         content = '',
         attachment_url = NULL,
         attachment_kind = NULL,
         attachment_name = NULL,
         attachment_size = NULL,
         pinned_at = NULL,
         pinned_by = NULL
   WHERE id = p_message_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_message_for_everyone(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_message_for_everyone(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_message_for_everyone(UUID) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify: expects 6 | true | true | 1
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'messages'
       AND column_name IN ('edited_at', 'deleted_at', 'pinned_at', 'pinned_by',
                           'reply_to', 'forwarded_from')) AS action_columns,
  (to_regprocedure('public.delete_message_for_everyone(uuid)') IS NOT NULL) AS rpc_exists,
  EXISTS (SELECT 1 FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
           WHERE t.tgname = 'messages_guard_body' AND c.relname = 'messages') AS guard_trigger,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE tablename = 'messages' AND indexname = 'idx_messages_pinned') AS pin_index;
