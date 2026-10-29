-- 005_security_fixes.sql
-- Run AFTER 004b. Fixes:
--  1. Comments / post media / reactions were readable by anyone who knew the post id
--     (policies only checked the post EXISTS, not its visibility).
--  2. Storage: 004b made post-media and stories buckets public and let any
--     authenticated user overwrite/delete anyone's files.
--  3. Stored absolute public URLs are rewritten to storage object paths so the
--     app can serve them via signed URLs.

-- =====================================================================
-- 1. Helper: can a viewer see this post? (mirrors posts_select, but
--    SECURITY DEFINER so other policies can reuse it without recursion)
-- =====================================================================
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
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
      OR (po.visibility = 'public'  AND NOT public.is_blocked(auth.uid(), po.author_id))
      OR (po.visibility = 'friends' AND public.are_friends(auth.uid(), po.author_id) AND NOT public.is_blocked(auth.uid(), po.author_id))
      OR (po.group_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.group_memberships gm
            WHERE gm.group_id = po.group_id AND gm.user_id = auth.uid()))
    )
  );
$$;

-- =====================================================================
-- 2. Tighten data-level RLS
-- =====================================================================
DROP POLICY IF EXISTS "post_media_select" ON public.post_media;
CREATE POLICY "post_media_select" ON public.post_media FOR SELECT USING (
  public.can_view_post(post_id)
);

DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (
  public.can_view_post(post_id)
);

DROP POLICY IF EXISTS "reactions_select" ON public.reactions;
CREATE POLICY "reactions_select" ON public.reactions FOR SELECT USING (
  public.can_view_post(
    COALESCE(post_id, (SELECT c.post_id FROM public.comments c WHERE c.id = reactions.comment_id))
  )
);

-- =====================================================================
-- 3. Storage: make post-media and stories private again
-- =====================================================================
UPDATE storage.buckets SET public = FALSE WHERE id IN ('post-media', 'stories');

-- ---------------------------------------------------------------------
-- Drop the permissive 004b policies and recreate them with per-user
-- folder ownership (every upload path starts with `<uid>/`).
-- ---------------------------------------------------------------------

-- avatars (bucket stays public-read by design)
DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;
CREATE POLICY "avatars_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
) WITH CHECK (
  bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "avatars_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
);

-- covers (bucket stays public-read by design)
DROP POLICY IF EXISTS "covers_insert" ON storage.objects;
DROP POLICY IF EXISTS "covers_update" ON storage.objects;
DROP POLICY IF EXISTS "covers_delete" ON storage.objects;
CREATE POLICY "covers_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'covers' AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "covers_update" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'covers' AND (storage.foldername(name))[1] = auth.uid()::text
) WITH CHECK (
  bucket_id = 'covers' AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "covers_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'covers' AND (storage.foldername(name))[1] = auth.uid()::text
);

-- groups (bucket stays public-read by design)
DROP POLICY IF EXISTS "groups_insert" ON storage.objects;
DROP POLICY IF EXISTS "groups_delete" ON storage.objects;
DROP POLICY IF EXISTS "groups_update" ON storage.objects;
CREATE POLICY "groups_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'groups' AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "groups_update" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'groups' AND (storage.foldername(name))[1] = auth.uid()::text
) WITH CHECK (
  bucket_id = 'groups' AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "groups_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'groups' AND (storage.foldername(name))[1] = auth.uid()::text
);

-- post-media: private. Viewer may read an object when they own it OR when a
-- post_media row points at this exact path and the parent post passes
-- can_view_post (owner / admin / visibility / friendship / group rules).
DROP POLICY IF EXISTS "post_media_select" ON storage.objects;
DROP POLICY IF EXISTS "post_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "post_media_delete" ON storage.objects;
DROP POLICY IF EXISTS "post_media_update" ON storage.objects;
CREATE POLICY "post_media_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'post-media' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.post_media pm
      JOIN public.posts p ON p.id = pm.post_id
      WHERE pm.url = storage.objects.name AND public.can_view_post(p.id)
    )
  )
);
CREATE POLICY "post_media_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'post-media' AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "post_media_update" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'post-media' AND (storage.foldername(name))[1] = auth.uid()::text
) WITH CHECK (
  bucket_id = 'post-media' AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "post_media_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'post-media' AND (storage.foldername(name))[1] = auth.uid()::text
);

-- stories: private. Viewer may read an object when they own it OR when an
-- unexpired story row points at this exact path and neither side blocked.
DROP POLICY IF EXISTS "stories_select" ON storage.objects;
DROP POLICY IF EXISTS "stories_insert" ON storage.objects;
DROP POLICY IF EXISTS "stories_delete" ON storage.objects;
DROP POLICY IF EXISTS "stories_update" ON storage.objects;
CREATE POLICY "stories_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'stories' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.media_url = storage.objects.name
        AND s.expires_at > NOW()
        AND NOT public.is_blocked(auth.uid(), s.author_id)
    )
  )
);
CREATE POLICY "stories_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'stories' AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "stories_update" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'stories' AND (storage.foldername(name))[1] = auth.uid()::text
) WITH CHECK (
  bucket_id = 'stories' AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "stories_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'stories' AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Also restrict reads on the public buckets' object rows for non-anon paths?
-- No: avatars/covers/groups remain intentionally public (profile images).
-- Their SELECT policies stay as-is; only write ownership was fixed above.

-- =====================================================================
-- 4. Rewrite stored absolute public URLs to storage object paths
--    (app now signs them at read time with createSignedUrls)
-- =====================================================================
UPDATE public.post_media
SET url = regexp_replace(url, '^https?://[^/]+/storage/v1/object/(?:public|sign)/post-media/', '')
WHERE url ~ '^https?://.+/(?:public|sign)/post-media/';

UPDATE public.stories
SET media_url = regexp_replace(media_url, '^https?://[^/]+/storage/v1/object/(?:public|sign)/stories/', '')
WHERE media_url ~ '^https?://.+/(?:public|sign)/stories/';

-- Strip any query string left from previously signed URLs
UPDATE public.post_media SET url = split_part(url, '?', 1) WHERE url LIKE '%?%';
UPDATE public.stories   SET media_url = split_part(media_url, '?', 1) WHERE media_url LIKE '%?%';
