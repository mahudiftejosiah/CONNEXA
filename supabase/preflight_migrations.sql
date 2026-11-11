-- Is everything I have ever asked you to paste actually in the database?
-- Paste this whole file into the dashboard SQL editor and press Run.
-- It only reads the catalog and counts rows, so it changes nothing.
-- Send me back the "result" column. Anything saying "no" is a feature that
-- is coded and deployed but still switched off in the database.

select q.item, q.result
from (
  values
  ('014 assistant bot table',
    case when to_regclass('public.bot_flags') is not null then 'yes' else 'no' end),
  ('015 chat attachments column',
    case when exists (select 1 from pg_attribute
                      where relid = 'public.messages'::regclass
                        and attname = 'attachment_kind') then 'yes' else 'no' end),
  ('015 chat-files bucket',
    case when exists (select 1 from storage.buckets where id = 'chat-files')
         then 'yes' else 'no' end),
  ('016 + 021 credits text mentions Wikipedia',
    case when coalesce((select position('ikipedia' in body) > 0
                        from public.site_content where key = 'credits'), false)
         then 'yes' else 'no' end),
  ('017 view-once messages column',
    case when exists (select 1 from pg_attribute
                      where relid = 'public.messages'::regclass
                        and attname = 'view_once') then 'yes' else 'no' end),
  ('018 study progress table',
    case when to_regclass('public.study_progress') is not null then 'yes' else 'no' end),
  ('019 delete chat per reader',
    case when exists (select 1 from pg_attribute
                      where relid = 'public.conversation_participants'::regclass
                        and attname = 'deleted_at') then 'yes' else 'no' end),
  ('020 book descriptions column',
    case when exists (select 1 from pg_attribute
                      where relid = 'public.study_books'::regclass
                        and attname = 'description') then 'yes' else 'no' end),
  ('022 live sessions table',
    case when to_regclass('public.live_sessions') is not null then 'yes' else 'no' end),
  ('022 live video bucket',
    case when exists (select 1 from storage.buckets where id = 'live')
         then 'yes' else 'no' end),
  ('seed: book covers filled in',
    (select (case when count(*) > 0 then 'yes' else 'no' end)::text
      from public.study_books where cover_url is not null)),
  ('seed: book descriptions filled in',
    (select (case when count(*) > 0 then 'yes' else 'no' end)::text
      from public.study_books
      where description is not null and description <> '')),
  ('how many profiles',
    (select count(*)::text from public.profiles)),
  ('how many posts',
    (select count(*)::text from public.posts)),
  ('how many messages',
    (select count(*)::text from public.messages))
) as q(item, result)
order by 1;
