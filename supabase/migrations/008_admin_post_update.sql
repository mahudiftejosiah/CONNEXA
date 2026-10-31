-- 008: Allow admins to update other users' posts (mirrors posts_delete from 006)
-- Needed by the admin "Manage user" page (edit any user's post).

DROP POLICY IF EXISTS "posts_update" ON public.posts;

CREATE POLICY "posts_update" ON public.posts FOR UPDATE
  USING (auth.uid() = author_id OR public.is_admin())
  WITH CHECK (auth.uid() = author_id OR public.is_admin());
