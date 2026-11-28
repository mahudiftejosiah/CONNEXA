-- 042: the inbox preview must show the newest message of every chat.
--
-- The inbox used to fetch a slice of "the newest messages across all your
-- chats" — two rows per conversation — and pick the newest one per chat out
-- of that slice. The slice is far too small: as soon as a couple of newer
-- messages arrived in other chats, an older chat fell out of the window and
-- its row read "No messages yet" for a chat that was full of messages.
--
-- This function answers "the newest message of each of these chats" exactly,
-- in one round trip, whatever else is happening in the account.

BEGIN;

CREATE OR REPLACE FUNCTION public.conversation_last_messages(p_conversation_ids UUID[])
RETURNS SETOF public.messages
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (m.conversation_id) m.*
  FROM public.messages m
  WHERE m.conversation_id = ANY(p_conversation_ids)
    AND public.is_conversation_participant(m.conversation_id)
  ORDER BY m.conversation_id, m.created_at DESC, m.id DESC;
$$;

REVOKE ALL ON FUNCTION public.conversation_last_messages(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversation_last_messages(UUID[]) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify. The function itself filters by participant, and in the SQL Editor
-- auth.uid() is NULL (no signed-in JWT), so calling it here returns 0 rows no
-- matter how good it is. So the check below asks the questions that are
-- answerable without a session: does the function exist, and how many chats
-- have messages in the first place. The real check is the inbox itself.
SELECT
  (SELECT CASE WHEN to_regprocedure('public.conversation_last_messages(uuid[])') IS NOT NULL
     THEN 'yes' ELSE 'NO' END) AS rpc_exists,
  (SELECT count(*) FROM public.conversations) AS chats_in_database,
  (SELECT count(DISTINCT conversation_id) FROM public.messages) AS chats_with_messages;
