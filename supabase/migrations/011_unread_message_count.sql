-- ============================================================
-- 011: unread message counter that scales to large inboxes
-- (avoids sending thousands of conversation ids through the API URL)
-- ============================================================
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
    AND m.sender_id <> p_user
    AND m.is_read = FALSE;
$$;

REVOKE ALL ON FUNCTION public.unread_message_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unread_message_count(UUID) TO authenticated;
