-- Run this THIRD, after 003b succeeds

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars',    'avatars',    TRUE,  10485760,  ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('covers',     'covers',     TRUE,  10485760,  ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('post-media', 'post-media', TRUE,  104857600, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','video/mp4','video/webm']),
  ('stories',    'stories',    TRUE,  52428800,  ARRAY['image/jpeg','image/jpg','image/png','image/webp','video/mp4','video/webm']),
  ('groups',     'groups',     TRUE,  10485760,  ARRAY['image/jpeg','image/jpg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow authenticated users to upload, anyone to read public buckets
CREATE POLICY "avatars_select"  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars_insert"  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);
CREATE POLICY "avatars_update"  ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);
CREATE POLICY "avatars_delete"  ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

CREATE POLICY "covers_select"   ON storage.objects FOR SELECT USING (bucket_id = 'covers');
CREATE POLICY "covers_insert"   ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'covers' AND auth.uid() IS NOT NULL);
CREATE POLICY "covers_update"   ON storage.objects FOR UPDATE USING (bucket_id = 'covers' AND auth.uid() IS NOT NULL);
CREATE POLICY "covers_delete"   ON storage.objects FOR DELETE USING (bucket_id = 'covers' AND auth.uid() IS NOT NULL);

CREATE POLICY "post_media_select" ON storage.objects FOR SELECT USING (bucket_id = 'post-media');
CREATE POLICY "post_media_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'post-media' AND auth.uid() IS NOT NULL);
CREATE POLICY "post_media_delete" ON storage.objects FOR DELETE USING (bucket_id = 'post-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "stories_select"  ON storage.objects FOR SELECT USING (bucket_id = 'stories');
CREATE POLICY "stories_insert"  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'stories' AND auth.uid() IS NOT NULL);
CREATE POLICY "stories_delete"  ON storage.objects FOR DELETE USING (bucket_id = 'stories' AND auth.uid() IS NOT NULL);

CREATE POLICY "groups_select"   ON storage.objects FOR SELECT USING (bucket_id = 'groups');
CREATE POLICY "groups_insert"   ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'groups' AND auth.uid() IS NOT NULL);
CREATE POLICY "groups_delete"   ON storage.objects FOR DELETE USING (bucket_id = 'groups' AND auth.uid() IS NOT NULL);
