
-- 037 — Social upgrades: message reactions, story reactions + replies,
-- story privacy audience, and a friend-list RPC for profile stat lists.

-- ---------------------------------------------------------------------------
-- 1. Create story audience column FIRST (required by story reaction policies)
-- ---------------------------------------------------------------------------
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'public'
  CHECK (audience IN ('public', 'friends'));

-- ---------------------------------------------------------------------------
-- 2. Message reactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_reactions_select" ON public.message_reactions;
DROP POLICY IF EXISTS "message_reactions_insert" ON public.message_reactions;
DROP POLICY IF EXISTS "message_reactions_update" ON public.message_reactions;
DROP POLICY IF EXISTS "message_reactions_delete" ON public.message_reactions;

CREATE POLICY "message_reactions_select" ON public.message_reactions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = message_reactions.conversation_id
      AND cp.user_id = auth.uid()
      AND cp.deleted_at IS NULL
  )
);

CREATE POLICY "message_reactions_insert" ON public.message_reactions FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = message_reactions.conversation_id
      AND cp.user_id = auth.uid()
      AND cp.deleted_at IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reactions.message_id
      AND m.deleted_at IS NULL
  )
);

CREATE POLICY "message_reactions_update" ON public.message_reactions FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "message_reactions_delete" ON public.message_reactions FOR DELETE
USING (auth.uid() = user_id);

ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- 3. Story reactions
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
-- 4. Story replies: a DM that carries the story it answered
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS story_id uuid
  REFERENCES public.stories(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 5. Tightened story read policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "stories_select" ON public.stories;

CREATE POLICY "stories_select" ON public.stories FOR SELECT USING (
  expires_at > NOW()
  AND (author_id = auth.uid() OR NOT public.is_blocked(auth.uid(), author_id))
  AND (
    audience = 'public'
    OR author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.user_id = auth.uid() AND f.friend_id = author_id)
         OR (f.user_id = author_id AND f.friend_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = TRUE
    )
  )
);

-- ---------------------------------------------------------------------------
-- 6. Friend list for profile stat lists
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profile_friend_ids(
  p_profile_id uuid,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_verified boolean,
  pro_expires_at timestamptz,
  last_seen timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.is_verified,
    p.pro_expires_at,
    p.last_seen
  FROM public.friendships f
  JOIN public.profiles p
    ON p.id = CASE
      WHEN f.user_id = p_profile_id THEN f.friend_id
      ELSE f.user_id
    END
  WHERE (f.user_id = p_profile_id OR f.friend_id = p_profile_id)
    AND p.id <> p_profile_id
    AND (
      p_profile_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.profiles t
        WHERE t.id = p_profile_id
          AND (
            t.profile_visibility = 'public'
            OR EXISTS (
              SELECT 1
              FROM public.friendships vf
              WHERE (vf.user_id = auth.uid() AND vf.friend_id = p_profile_id)
                 OR (vf.user_id = p_profile_id AND vf.friend_id = auth.uid())
            )
          )
      )
    )
  ORDER BY p.display_name
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 200), 200), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.profile_friend_ids(uuid, integer, integer)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.profile_friend_ids(uuid, integer, integer)
TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Realtime publication
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'story_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.story_reactions;
  END IF;
END $$;
