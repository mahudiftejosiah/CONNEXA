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
  ('023 message actions columns',
    case when exists (select 1 from pg_attribute
                      where relid = 'public.messages'::regclass
                        and attname = 'pinned_at') then 'yes' else 'no' end),
  ('023 unsend function',
    case when to_regprocedure('public.delete_message_for_everyone(uuid)') is not null
         then 'yes' else 'no' end),
  ('024 highlight table',
    case when to_regclass('public.study_book_highlights') is not null then 'yes' else 'no' end),
  ('025 featured shelf + published column',
    case when exists (select 1 from pg_attribute
                      where relid = 'public.site_shortcuts'::regclass
                        and attname = 'published') then 'yes' else 'no' end),
  ('025 starter featured sites',
    (select (case when count(*) > 0 then 'yes' else 'no (' || count(*)::text || ')' end)::text
      from public.site_shortcuts where category = 'featured')),
  ('026 worldwide location columns',
    case when exists (select 1 from pg_attribute
                      where relid = 'public.profiles'::regclass
                        and attname = 'country_code') then 'yes' else 'no' end),
  ('027 displayed followers + PRO expiry columns',
    case when exists (select 1 from pg_attribute
                      where relid = 'public.profiles'::regclass
                        and attname = 'display_followers')
         and  exists (select 1 from pg_attribute
                      where relid = 'public.profiles'::regclass
                        and attname = 'pro_expires_at') then 'yes' else 'no' end),
  ('027 privilege guard trigger',
    case when exists (select 1 from pg_trigger
                      where tgrelid = 'public.profiles'::regclass
                        and tgname = 'profiles_guard_privileges') then 'yes' else 'no' end),
  ('028 hashing usage table',
    case when to_regclass('public.hashing_usage') is not null then 'yes' else 'no' end),
  ('029 PRO switches + is_pro()',
    case when to_regclass('public.pro_features') is not null
          and to_regprocedure('public.is_pro(uuid,text)') is not null then 'yes' else 'no' end),
  ('029 visit tracking tables',
    case when to_regclass('public.profile_visits') is not null
          and to_regclass('public.post_views') is not null then 'yes' else 'no' end),
  ('030 questions, confessions, polls, blocked tags',
    case when to_regclass('public.daily_questions') is not null
          and to_regclass('public.confessions') is not null
          and to_regclass('public.polls') is not null
          and to_regclass('public.blocked_hashtags') is not null then 'yes' else 'no' end),
  ('031 quizzes, music, events, badges, marketplace',
    case when to_regclass('public.quizzes') is not null
          and to_regclass('public.quiz_answers') is not null
          and to_regclass('public.music_tracks') is not null
          and to_regclass('public.events') is not null
          and to_regclass('public.badges') is not null
          and to_regclass('public.listings') is not null then 'yes' else 'no' end),
  ('031 pro-media bucket + starter badges',
    case when exists (select 1 from storage.buckets where id = 'pro-media')
          and (select count(*) from public.badges) >= 8 then 'yes' else 'no' end),
  ('032 streaming permissions + admin rights',
    case when to_regclass('public.stream_permissions') is not null
          and to_regprocedure('public.stream_allowed(uuid)') is not null then 'yes' else 'no' end),
  ('033 live viewer chat',
    case when to_regclass('public.live_messages') is not null then 'yes' else 'no' end),
  ('033 scheduled streams + kept highlight',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.live_sessions')
                        and attname = 'scheduled_at')
          and exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.live_sessions')
                        and attname = 'highlight_path') then 'yes' else 'no' end),
  ('033 quiz duels + honest scoring',
    case when to_regclass('public.quiz_duels') is not null
          and to_regprocedure('public.record_duel_score(uuid,integer)') is not null then 'yes' else 'no' end),
  ('033 event invitations',
    case when to_regclass('public.event_invites') is not null then 'yes' else 'no' end),
  ('033 event end time + banner',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.events') and attname = 'ends_at')
          and exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.events') and attname = 'banner_path')
         then 'yes' else 'no' end),
  ('033 poll categories + question descriptions',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.polls') and attname = 'category')
          and exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.daily_questions') and attname = 'description')
         then 'yes' else 'no' end),
  ('033 track availability',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.music_tracks') and attname = 'availability')
         then 'yes' else 'no' end),
  ('033 broadcasts can be reported',
    case when exists (select 1 from pg_constraint
                      where conrelid = to_regclass('public.content_reports')
                        and pg_get_constraintdef(oid) like '%stream%') then 'yes' else 'no' end),
  ('033 visit opt-out + daily counter',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.profiles') and attname = 'hide_visit_activity')
          and to_regprocedure('public.record_profile_visit(uuid)') is not null then 'yes' else 'no' end),
  ('034 admin whole-database user search',
    case when to_regprocedure('public.admin_find_users(text,integer,integer)') is not null then 'yes' else 'no' end),
  ('035 PRO subscription plans',
    case when to_regclass('public.pro_plans') is not null then 'yes' else 'no' end),
  ('035 plans published',
    (select case when to_regclass('public.pro_plans') is null then 'table missing'
                 else (select count(*)::text from public.pro_plans where active) end)),
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
