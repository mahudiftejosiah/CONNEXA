-- ============================================================
-- CONNEXA - Storage Buckets & Policies
-- Run in Supabase SQL Editor AFTER migrations 001-003
-- ============================================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars',    'avatars',    TRUE,  10485760,   ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('covers',     'covers',     TRUE,  10485760,   ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('post-media', 'post-media', FALSE, 104857600,  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','video/mp4','video/webm']),
  ('stories',    'stories',    FALSE, 52428800,   ARRAY['image/jpeg','image/jpg','image/png','image/webp','video/mp4','video/webm']),
  ('groups',     'groups',     TRUE,  10485760,   ARRAY['image/jpeg','image/jpg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- AVATARS bucket (public)
-- ============================================================
CREATE POLICY "avatars_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "avatars_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- ============================================================
-- COVERS bucket (public)
-- ============================================================
CREATE POLICY "covers_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'covers');

CREATE POLICY "covers_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'covers'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "covers_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'covers'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "covers_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'covers'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- ============================================================
-- POST-MEDIA bucket (private — served via signed URLs)
-- ============================================================
CREATE POLICY "post_media_select" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'post-media'
    AND auth.uid() IS NOT NULL
    AND (
      -- owner can always access
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR
      -- others can access if the post is visible to them
      EXISTS (
        SELECT 1 FROM public.posts p
        WHERE p.author_id::TEXT = (storage.foldername(name))[1]
          AND (
            p.visibility = 'public'
            OR (p.visibility = 'friends' AND public.are_friends(auth.uid(), p.author_id))
            OR p.author_id = auth.uid()
          )
          AND NOT public.is_blocked(auth.uid(), p.author_id)
      )
    )
  );

CREATE POLICY "post_media_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'post-media'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "post_media_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'post-media'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- ============================================================
-- STORIES bucket (private — expires after 24h)
-- ============================================================
CREATE POLICY "stories_storage_select" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'stories'
    AND auth.uid() IS NOT NULL
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR EXISTS (
        SELECT 1 FROM public.stories s
        WHERE s.author_id::TEXT = (storage.foldername(name))[1]
          AND s.expires_at > NOW()
          AND NOT public.is_blocked(auth.uid(), s.author_id)
      )
    )
  );

CREATE POLICY "stories_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'stories'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "stories_storage_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'stories'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- ============================================================
-- GROUPS bucket (public)
-- ============================================================
CREATE POLICY "groups_storage_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'groups');

CREATE POLICY "groups_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'groups'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "groups_storage_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'groups'
    AND auth.uid() IS NOT NULL
  );
