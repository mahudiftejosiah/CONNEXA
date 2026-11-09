-- ============================================================
-- 021 — Credits: say where the shelf blurbs came from
-- ============================================================
-- The Study Room cards now quote Wikipedia for the titles that have an
-- article, and Wikipedia text is CC BY-SA 4.0 — it has to be named where it
-- is used. This appends one sentence to the existing credits page instead of
-- rewriting it, so anything the admin has typed there survives.
--
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once: the
-- second run matches the "already added" test and changes nothing.

BEGIN;

UPDATE public.site_content
SET body = body || E'\n\nSHELF SUMMARIES\n'
  || E'• Wikipedia (en.wikipedia.org) — the short description on a Study Room '
  || E'shelf card is the opening of that title''s Wikipedia article, where one '
  || E'exists. Wikipedia text is licensed CC BY-SA 4.0, so CONNEXA credits it '
  || E'here and on the card itself. Older titles with no article are described '
  || E'from their own title page — subtitle and author — taken from Project '
  || E'Gutenberg.'
WHERE key = 'credits'
  AND body NOT LIKE '%SHELF SUMMARIES%';

COMMIT;

-- Check it landed:
SELECT length(body) AS credits_chars, body LIKE '%SHELF SUMMARIES%' AS added
FROM public.site_content WHERE key = 'credits';
