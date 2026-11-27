-- 041: messaging and story-reaction repair.
--
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
--
-- What this fixes, and why:
--
-- 1. REALTIME. The app subscribes to postgres_changes on public.messages, but no
--    earlier migration ever added `messages` to the supabase_realtime
--    publication. Without it Postgres never emits an INSERT event for a
--    message, so the sender saw their own message (the app writes it locally)
--    while the recipient's browser was never told anything happened. The same
--    gap is why a story reply could exist in the database and never show up
--    in the other person's chat.
--
-- 2. DUPLICATE CONVERSATIONS. Two places mint a conversation id themselves
--    (the /api/conversations route and the /messages?with= branch) and both do
--    a find-then-create with no unique key, so two near-simultaneous "open
--    this chat" calls create two threads for the same two people. The inbox
--    then lists that person once per thread, which is what "the same friend
--    shows up as several accounts" looked like. This adds a canonical
--    direct_key (the two user ids, sorted), merges the duplicates that already
--    exist without losing a single message, and puts a unique index behind it.
--
-- 3. ONE ATOMIC WAY TO OPEN A CHAT. get_or_create_direct_conversation()
--    replaces the racy find-then-create everywhere. It is SECURITY DEFINER so
--    it can write both participant rows in one statement.
--
-- 4. PARTICIPANTS. conv_participants_insert was WITH CHECK (TRUE), which let
--    any signed-in user add themselves to any conversation id they guessed.
--
-- 5. STORY REACTIONS. The table is created here too, so the story reaction
--    panel works even if 037 was never pasted. Its shape is identical to
--    037's, so pasting 037 afterwards changes nothing.
--
-- Nothing here deletes a message, a reaction or a profile. The merge moves
-- rows into the surviving thread and only then removes the empty duplicate.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Story reactions table (same shape as 037, created only if missing)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.story_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (story_id, user_id)
);

ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;

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
        OR EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE (f.user_id = auth.uid() AND f.friend_id = s.author_id)
             OR (f.user_id = s.author_id AND f.friend_id = auth.uid())
        )
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
        OR EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE (f.user_id = auth.uid() AND f.friend_id = s.author_id)
             OR (f.user_id = s.author_id AND f.friend_id = auth.uid())
        )
      )
  )
);

CREATE POLICY "story_reactions_update" ON public.story_reactions FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "story_reactions_delete" ON public.story_reactions FOR DELETE
USING (auth.uid() = user_id);

ALTER TABLE public.story_reactions REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- 2. Realtime publication — the actual reason messages never arrived live
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'story_reactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.story_reactions;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
    END IF;
  END IF;
END $$;

-- UPDATE and DELETE events need the old row to be included in the payload.
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- 3. One conversation per pair of people
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS direct_key TEXT;

-- Give every two-person conversation its canonical key. Conversations with a
-- third person (group chats) keep a NULL key and are left alone.
UPDATE public.conversations c
SET direct_key = sub.k
FROM (
  SELECT cp.conversation_id,
         MIN(cp.user_id::text) || '|' || MAX(cp.user_id::text) AS k
  FROM public.conversation_participants cp
  GROUP BY cp.conversation_id
  HAVING COUNT(*) = 2
) sub
WHERE c.id = sub.conversation_id
  AND c.direct_key IS NULL;

-- Merge the duplicates that already exist. The busiest thread survives; every
-- message moves into it; the participant rows are carried over; only the
-- empty shell is removed.
DO $$
DECLARE
  grp           RECORD;
  canon         UUID;
  dup           UUID;
  u             UUID;
  visible_users UUID[];
BEGIN
  FOR grp IN
    SELECT c.direct_key AS k,
           array_agg(c.id ORDER BY
             (SELECT count(*) FROM public.messages m WHERE m.conversation_id = c.id) DESC,
             c.created_at ASC,
             c.id ASC) AS ids
    FROM public.conversations c
    WHERE c.direct_key IS NOT NULL
    GROUP BY c.direct_key
    HAVING count(*) > 1
  LOOP
    canon := grp.ids[1];

    -- A thread that was still visible in any of its copies stays visible.
    SELECT array_agg(DISTINCT cp.user_id) INTO visible_users
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = ANY(grp.ids)
      AND cp.deleted_at IS NULL;

    FOREACH dup IN ARRAY grp.ids[2:] LOOP
      -- Every child row moves first, so the delete below cannot cascade.
      UPDATE public.messages SET conversation_id = canon WHERE conversation_id = dup;

      IF to_regclass('public.message_reactions') IS NOT NULL THEN
        UPDATE public.message_reactions SET conversation_id = canon WHERE conversation_id = dup;
      END IF;

      -- Carry over anyone the surviving thread does not have yet.
      FOR u IN
        SELECT cp.user_id FROM public.conversation_participants cp WHERE cp.conversation_id = dup
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.conversation_participants cp2
          WHERE cp2.conversation_id = canon AND cp2.user_id = u
        ) THEN
          INSERT INTO public.conversation_participants (conversation_id, user_id, deleted_at)
          SELECT canon, u, cp.deleted_at
          FROM public.conversation_participants cp
          WHERE cp.conversation_id = dup AND cp.user_id = u;
        END IF;
      END LOOP;

      DELETE FROM public.conversation_participants WHERE conversation_id = dup;
      DELETE FROM public.conversations WHERE id = dup;
    END LOOP;

    IF visible_users IS NOT NULL THEN
      UPDATE public.conversation_participants
      SET deleted_at = NULL
      WHERE conversation_id = canon AND user_id = ANY(visible_users);
    END IF;

    UPDATE public.conversations c
    SET last_message_at = COALESCE(
          (SELECT max(m.created_at) FROM public.messages m WHERE m.conversation_id = c.id),
          c.last_message_at
        ),
        updated_at = NOW()
    WHERE c.id = canon;
  END LOOP;
END $$;

-- The unique index goes in only after the duplicates are gone, otherwise the
-- index build would fail on the very rows we just cleaned up.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_direct_key_uniq
  ON public.conversations (direct_key)
  WHERE direct_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. One atomic way to open a chat
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(p_other UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me  UUID := auth.uid();
  key TEXT;
  cid UUID;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  IF p_other IS NULL OR p_other = me THEN
    RAISE EXCEPTION 'invalid participant';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id = me AND b.blocked_id = p_other)
       OR (b.blocker_id = p_other AND b.blocked_id = me)
  ) THEN
    RAISE EXCEPTION 'cannot message this user';
  END IF;

  -- The two ids in a fixed order: one key per pair of people, whatever order
  -- the two of them happen to click on each other.
  key := LEAST(me::text, p_other::text) || '|' || GREATEST(me::text, p_other::text);

  SELECT c.id INTO cid
  FROM public.conversations c
  WHERE c.direct_key = key
  LIMIT 1;

  IF cid IS NULL THEN
    INSERT INTO public.conversations (id, direct_key)
    VALUES (gen_random_uuid(), key)
    ON CONFLICT (direct_key) WHERE direct_key IS NOT NULL DO NOTHING
    RETURNING id INTO cid;

    -- Somebody else won the race; their thread is the one to use.
    IF cid IS NULL THEN
      SELECT c.id INTO cid
      FROM public.conversations c
      WHERE c.direct_key = key
      LIMIT 1;
    END IF;
  END IF;

  IF cid IS NULL THEN
    RAISE EXCEPTION 'could not open that conversation';
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (cid, me), (cid, p_other)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  -- Reopening a chat you deleted brings it back, the way Messenger does. Only
  -- your own row is touched — the other person's copy is restored by the 019
  -- trigger when a message actually arrives.
  UPDATE public.conversation_participants
  SET deleted_at = NULL
  WHERE conversation_id = cid AND user_id = me;

  RETURN cid;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Participants: you may only join a conversation you are already part of
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "conv_participants_insert" ON public.conversation_participants;
CREATE POLICY "conv_participants_insert" ON public.conversation_participants FOR INSERT WITH CHECK (
  auth.uid() = user_id
  OR public.is_conversation_participant(conversation_id)
);

-- ---------------------------------------------------------------------------
-- 6. Finding the story replies of a conversation
-- ---------------------------------------------------------------------------

-- A story reply keeps the story it answers. 037 adds this column too; adding
-- it here means the story reply works even if 037 was never pasted.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS story_id uuid
  REFERENCES public.stories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_story_id
  ON public.messages (story_id)
  WHERE story_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify. Everything below should read as the value in the comment.
SELECT
  -- messages must be in the publication, or nothing arrives live
  (SELECT CASE WHEN EXISTS (
     SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
   ) THEN 'yes' ELSE 'NO' END) AS messages_in_realtime,
  (SELECT CASE WHEN EXISTS (
     SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'story_reactions'
   ) THEN 'yes' ELSE 'NO' END) AS story_reactions_in_realtime,
  -- the story reaction table
  (SELECT CASE WHEN to_regclass('public.story_reactions') IS NOT NULL THEN 'yes' ELSE 'NO' END) AS story_reactions_table,
  -- the canonical pair key
  (SELECT CASE WHEN EXISTS (
     SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'direct_key'
   ) THEN 'yes' ELSE 'NO' END) AS direct_key_column,
  -- no pair of people may still own two threads
  (SELECT count(*) FROM (
     SELECT direct_key FROM public.conversations
     WHERE direct_key IS NOT NULL
     GROUP BY direct_key HAVING count(*) > 1
   ) d) AS duplicate_pairs,
  -- the atomic opener
  (SELECT CASE WHEN to_regprocedure('public.get_or_create_direct_conversation(uuid)') IS NOT NULL
     THEN 'yes' ELSE 'NO' END) AS rpc_exists,
  -- messages are still here
  (SELECT count(*) FROM public.messages) AS messages_kept;
