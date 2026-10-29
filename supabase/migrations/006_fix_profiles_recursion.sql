-- 006_fix_profiles_recursion.sql
-- Fixes: "infinite recursion detected in policy for relation profiles".
-- Every RLS policy checked admin status with
--   EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin)
-- which re-triggers profiles' own SELECT policy -> Postgres aborts the query.
-- Replace with a SECURITY DEFINER function (runs as table owner, bypasses RLS).

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- Same fix inside can_view_post (kept in sync with posts_select).
CREATE OR REPLACE FUNCTION public.can_view_post(p_post_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.posts po
    WHERE po.id = p_post_id AND (
      po.author_id = auth.uid()
      OR public.is_admin()
      OR (po.visibility = 'public'  AND NOT public.is_blocked(auth.uid(), po.author_id))
      OR (po.visibility = 'friends' AND public.are_friends(auth.uid(), po.author_id) AND NOT public.is_blocked(auth.uid(), po.author_id))
      OR (po.group_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.group_memberships gm
            WHERE gm.group_id = po.group_id AND gm.user_id = auth.uid()))
    )
  );
$$;

-- ---- Recreate every policy that referenced profiles for the admin check ----

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (
  profile_visibility = 'public' OR auth.uid() = id
  OR (profile_visibility = 'friends' AND public.are_friends(auth.uid(), id))
  OR public.is_admin()
);

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE USING (
  auth.uid() = id OR public.is_admin()
);

DROP POLICY IF EXISTS "posts_select" ON public.posts;
CREATE POLICY "posts_select" ON public.posts FOR SELECT USING (
  public.is_admin()
  OR author_id = auth.uid()
  OR (visibility = 'public' AND NOT public.is_blocked(auth.uid(), author_id))
  OR (visibility = 'friends' AND public.are_friends(auth.uid(), author_id) AND NOT public.is_blocked(auth.uid(), author_id))
  OR (group_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.group_memberships WHERE group_id = posts.group_id AND user_id = auth.uid()))
);

DROP POLICY IF EXISTS "posts_delete" ON public.posts;
CREATE POLICY "posts_delete" ON public.posts FOR DELETE USING (
  auth.uid() = author_id OR public.is_admin()
);

DROP POLICY IF EXISTS "post_media_delete" ON public.post_media;
CREATE POLICY "post_media_delete" ON public.post_media FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.posts WHERE id = post_id AND author_id = auth.uid())
  OR public.is_admin()
);

DROP POLICY IF EXISTS "comments_delete" ON public.comments;
CREATE POLICY "comments_delete" ON public.comments FOR DELETE USING (
  auth.uid() = author_id OR public.is_admin()
);

DROP POLICY IF EXISTS "stories_delete" ON public.stories;
CREATE POLICY "stories_delete" ON public.stories FOR DELETE USING (
  auth.uid() = author_id OR public.is_admin()
);

DROP POLICY IF EXISTS "groups_select" ON public.groups;
CREATE POLICY "groups_select" ON public.groups FOR SELECT USING (
  visibility = 'public' OR owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.group_memberships WHERE group_id = id AND user_id = auth.uid())
  OR public.is_admin()
);

DROP POLICY IF EXISTS "groups_delete" ON public.groups;
CREATE POLICY "groups_delete" ON public.groups FOR DELETE USING (
  owner_id = auth.uid() OR public.is_admin()
);

DROP POLICY IF EXISTS "group_memberships_delete" ON public.group_memberships;
CREATE POLICY "group_memberships_delete" ON public.group_memberships FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner','admin'))
  OR public.is_admin()
);

DROP POLICY IF EXISTS "content_reports_select" ON public.content_reports;
CREATE POLICY "content_reports_select" ON public.content_reports FOR SELECT USING (
  reporter_id = auth.uid() OR public.is_admin()
);

DROP POLICY IF EXISTS "content_reports_update" ON public.content_reports;
CREATE POLICY "content_reports_update" ON public.content_reports FOR UPDATE USING (
  public.is_admin()
);

DROP POLICY IF EXISTS "moderation_actions_select" ON public.moderation_actions;
CREATE POLICY "moderation_actions_select" ON public.moderation_actions FOR SELECT USING (
  public.is_admin()
);

DROP POLICY IF EXISTS "moderation_actions_insert" ON public.moderation_actions;
CREATE POLICY "moderation_actions_insert" ON public.moderation_actions FOR INSERT WITH CHECK (
  auth.uid() = admin_id AND public.is_admin()
);
