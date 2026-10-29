-- 007_group_policy_recursion.sql
-- Continues the 006 fix. Two more policy loops exist in the live schema:
--  1. group_memberships_select references groups AND group_memberships itself;
--     groups_select references group_memberships  -> mutual + self recursion.
--  2. conversation_participants_select references itself (cp2) and is read by
--     conversations_select / messages_select     -> recursion on every message query.
-- Same remedy as 006: SECURITY DEFINER helper functions (run as owner, bypass RLS).

CREATE OR REPLACE FUNCTION public.is_group_member(gid UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_memberships
                 WHERE group_id = gid AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(gid UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_memberships
                 WHERE group_id = gid AND user_id = auth.uid()
                   AND role IN ('owner','admin'));
$$;

CREATE OR REPLACE FUNCTION public.group_is_public(gid UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.groups
                 WHERE id = gid AND visibility = 'public');
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(cid UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversation_participants
                 WHERE conversation_id = cid AND user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_group_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_group_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.group_is_public(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_conversation_participant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_admin(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_is_public(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO anon, authenticated;

-- posts_select: replace the group-membership subquery (006's version still had it)
DROP POLICY IF EXISTS "posts_select" ON public.posts;
CREATE POLICY "posts_select" ON public.posts FOR SELECT USING (
  public.is_admin()
  OR author_id = auth.uid()
  OR (visibility = 'public' AND NOT public.is_blocked(auth.uid(), author_id))
  OR (visibility = 'friends' AND public.are_friends(auth.uid(), author_id) AND NOT public.is_blocked(auth.uid(), author_id))
  OR (group_id IS NOT NULL AND public.is_group_member(group_id))
);

-- GROUPS
DROP POLICY IF EXISTS "groups_select" ON public.groups;
CREATE POLICY "groups_select" ON public.groups FOR SELECT USING (
  visibility = 'public' OR owner_id = auth.uid()
  OR public.is_group_member(id)
  OR public.is_admin()
);

DROP POLICY IF EXISTS "groups_update" ON public.groups;
CREATE POLICY "groups_update" ON public.groups FOR UPDATE USING (
  owner_id = auth.uid() OR public.is_group_admin(id)
);

-- GROUP MEMBERSHIPS
DROP POLICY IF EXISTS "group_memberships_select" ON public.group_memberships;
CREATE POLICY "group_memberships_select" ON public.group_memberships FOR SELECT USING (
  user_id = auth.uid()
  OR public.group_is_public(group_id)
  OR public.is_group_member(group_id)
);

DROP POLICY IF EXISTS "group_memberships_insert" ON public.group_memberships;
CREATE POLICY "group_memberships_insert" ON public.group_memberships FOR INSERT WITH CHECK (
  auth.uid() = user_id AND public.group_is_public(group_id)
);

DROP POLICY IF EXISTS "group_memberships_delete" ON public.group_memberships;
CREATE POLICY "group_memberships_delete" ON public.group_memberships FOR DELETE USING (
  user_id = auth.uid()
  OR public.is_group_admin(group_id)
  OR public.is_admin()
);

DROP POLICY IF EXISTS "group_memberships_update" ON public.group_memberships;
CREATE POLICY "group_memberships_update" ON public.group_memberships FOR UPDATE USING (
  public.is_group_admin(group_id)
);

-- CONVERSATION PARTICIPANTS
DROP POLICY IF EXISTS "conv_participants_select" ON public.conversation_participants;
CREATE POLICY "conv_participants_select" ON public.conversation_participants FOR SELECT USING (
  user_id = auth.uid() OR public.is_conversation_participant(conversation_id)
);

-- CONVERSATIONS / MESSAGES (same rules, routed through the helper so the
-- participants subquery can no longer loop)
DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
CREATE POLICY "conversations_select" ON public.conversations FOR SELECT USING (
  public.is_conversation_participant(id)
);

DROP POLICY IF EXISTS "conversations_update" ON public.conversations;
CREATE POLICY "conversations_update" ON public.conversations FOR UPDATE USING (
  public.is_conversation_participant(id)
);

DROP POLICY IF EXISTS "messages_select" ON public.messages;
CREATE POLICY "messages_select" ON public.messages FOR SELECT USING (
  public.is_conversation_participant(conversation_id)
);

DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND public.is_conversation_participant(conversation_id)
);

DROP POLICY IF EXISTS "messages_update" ON public.messages;
CREATE POLICY "messages_update" ON public.messages FOR UPDATE USING (
  public.is_conversation_participant(conversation_id)
);
