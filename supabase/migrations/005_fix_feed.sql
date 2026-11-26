-- Drop old version first, then recreate with correct signature
DROP FUNCTION IF EXISTS public.unread_message_count(uuid);

CREATE OR REPLACE FUNCTION public.unread_message_count(p_user UUID)
RETURNS INT AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INT
    FROM public.messages m
    JOIN public.conversation_participants cp
      ON cp.conversation_id = m.conversation_id
    WHERE cp.user_id = p_user
      AND m.sender_id <> p_user
      AND m.is_read = FALSE
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Confirm it works
SELECT public.unread_message_count('00000000-0000-0000-0000-000000000000'::uuid);
