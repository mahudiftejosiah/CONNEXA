-- ============================================================
-- CONNEXA 010 — Voice recordings in posts
-- ============================================================

-- Allow audio media type on posts
ALTER TABLE public.post_media
  DROP CONSTRAINT IF EXISTS post_media_type_check;
ALTER TABLE public.post_media
  ADD CONSTRAINT post_media_type_check CHECK (type IN ('image', 'video', 'audio'));

-- Let the post-media bucket accept audio recordings
UPDATE storage.buckets
SET allowed_mime_types = allowed_mime_types
  || ARRAY['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4']
WHERE id = 'post-media';
