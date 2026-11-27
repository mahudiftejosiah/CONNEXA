-- Is everything I have ever asked you to paste actually in the database?
-- Paste this whole file into the dashboard SQL editor and press Run.
-- It only reads the catalog and counts rows, so it changes nothing.
-- Send me back the "result" column. Anything saying "no" is a feature that
-- is coded and deployed but still switched off in the database.

-- Counting rows in a table that has not been created yet would abort the whole
-- check before printing a single line, so the counting goes through a helper
-- that looks the table up first and only builds the query when it is really
-- there. It only ever runs a count, and it is dropped again at the bottom.
create or replace function connexa_probe_count(t text, filt text default null)
returns text language plpgsql as $$
declare c bigint;
begin
  if to_regclass(t) is null then return 'no (table missing)'; end if;
  execute format('select count(*) from %s%s', t,
                 case when filt is null then '' else ' where ' || filt end)
    into c;
  return c::text;
exception when others then
  return 'no (column missing)';
end $$;

select q.item, q.result
from (
  values
  ('014 assistant bot table',
    case when to_regclass('public.bot_flags') is not null then 'yes' else 'no' end),
  ('015 chat attachments column',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.messages')
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
                      where attrelid = to_regclass('public.messages')
                        and attname = 'view_once') then 'yes' else 'no' end),
  ('018 study progress table',
    case when to_regclass('public.study_progress') is not null then 'yes' else 'no' end),
  ('019 delete chat per reader',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.conversation_participants')
                        and attname = 'deleted_at') then 'yes' else 'no' end),
  ('020 book descriptions column',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.study_books')
                        and attname = 'description') then 'yes' else 'no' end),
  ('022 live sessions table',
    case when to_regclass('public.live_sessions') is not null then 'yes' else 'no' end),
  ('022 live video bucket',
    case when exists (select 1 from storage.buckets where id = 'live')
         then 'yes' else 'no' end),
  ('023 message actions columns',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.messages')
                        and attname = 'pinned_at') then 'yes' else 'no' end),
  ('023 unsend function',
    case when to_regprocedure('public.delete_message_for_everyone(uuid)') is not null
         then 'yes' else 'no' end),
  ('024 highlight table',
    case when to_regclass('public.study_book_highlights') is not null then 'yes' else 'no' end),
  ('025 featured shelf + published column',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.site_shortcuts')
                        and attname = 'published') then 'yes' else 'no' end),
  ('025 starter featured sites',
    connexa_probe_count('public.site_shortcuts', 'category = ''featured''')),
  ('026 worldwide location columns',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.profiles')
                        and attname = 'country_code') then 'yes' else 'no' end),
  ('027 displayed followers + PRO expiry columns',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.profiles')
                        and attname = 'display_followers')
         and  exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.profiles')
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
  ('031 pro-media bucket (audio uploads need it)',
    case when exists (select 1 from storage.buckets where id = 'pro-media')
         then 'yes' else 'no' end),
  ('031 starter badges (want 8 or more)',
    connexa_probe_count('public.badges')),
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
  ('035 plans published (want 3)',
    connexa_probe_count('public.pro_plans', 'active')),
  ('036 featured slideshow table',
    case when to_regclass('public.featured_slides') is not null then 'yes' else 'no' end),
  ('036 slideshow live slides',
    connexa_probe_count('public.featured_slides',
      'active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())')),
  ('037 message reactions table',
    case when to_regclass('public.message_reactions') is not null then 'yes' else 'no' end),
  ('037 story reactions table',
    case when to_regclass('public.story_reactions') is not null then 'yes' else 'no' end),
  ('037 story replies column',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.messages') and attname = 'story_id')
         then 'yes' else 'no' end),
  ('037 story audience column',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.stories') and attname = 'audience')
         then 'yes' else 'no' end),
  ('037 friend list RPC',
    case when to_regprocedure('public.profile_friend_ids(uuid,integer,integer)') is not null
         then 'yes' else 'no' end),
  ('039 stories upgrade columns',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.stories')
                        and attname = 'published_at')
          and exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.stories')
                        and attname = 'overlay_position') then 'yes' else 'no' end),
  ('039 story view RPC',
    case when to_regprocedure('public.mark_story_viewed(uuid)') is not null
         then 'yes' else 'no' end),
  ('039 stories in realtime publication',
    case when exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public'
                        and tablename = 'stories') then 'yes' else 'no' end),
  ('040 onboarding done column',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.profiles')
                        and attname = 'onboarding_done') then 'yes' else 'no' end),
  ('041 MESSAGES IN REALTIME PUBLICATION',
    case when exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public'
                        and tablename = 'messages') then 'yes' else 'NO - messages never arrive live' end),
  ('041 canonical pair key column',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.conversations')
                        and attname = 'direct_key') then 'yes' else 'no' end),
  ('041 duplicate conversation pairs (want 0)',
    connexa_probe_count('public.conversations',
      'direct_key in (select direct_key from public.conversations group by direct_key having count(*) > 1)')),
  ('041 atomic chat opener RPC',
    case when to_regprocedure('public.get_or_create_direct_conversation(uuid)') is not null
         then 'yes' else 'no' end),
  ('041 story replies column on messages',
    case when exists (select 1 from pg_attribute
                      where attrelid = to_regclass('public.messages')
                        and attname = 'story_id') then 'yes' else 'no' end),
  ('seed: book covers filled in',
    connexa_probe_count('public.study_books', 'cover_url is not null')),
  ('seed: book descriptions filled in',
    connexa_probe_count('public.study_books', 'char_length(description) > 0')),
  ('how many profiles',
    connexa_probe_count('public.profiles')),
  ('how many posts',
    connexa_probe_count('public.posts')),
  ('how many messages',
    connexa_probe_count('public.messages'))
) as q(item, result)
order by 1;

drop function if exists connexa_probe_count(text, text);
