-- ============================================================
-- CONNEXA — 1000 demo accounts seed (500 Nigerian + 500 American)
-- Run in the Supabase dashboard SQL editor (all at once).
-- Safe to re-run: users, friendships, posts, media and
-- conversations all guard against duplicates.
--
-- Every account LOGS IN normally at /login:
--   email:    <first>_<last>_<n>@connexa1000.test
--             e.g. chidi_okafor_1@connexa1000.test
--   password: ConnexaDemo2026!   (same for all 1000)
-- Emails use the reserved .test domain so nothing is ever sent
-- to a real inbox. These are DEMO accounts, not real people.
-- ============================================================

-- ------------------------------------------------------------
-- 0) PREFLIGHT — read this first result before the rest runs.
--    admins must be 1 (that account becomes the centre of the
--    demo: everyone is friends with it), demo_accounts must be
--    1000 (the provisioner script creates them; this seed only
--    uses them). Nothing below has an id to edit by hand.
-- ------------------------------------------------------------
select
  (select count(*) from public.profiles where is_admin) as admins,
  (select count(*) from public.profiles
     where id::text like '00000000-0000-4000-8000-%') as demo_accounts,
  (select username from public.profiles
     where is_admin order by created_at limit 1) as admin_used;

-- ------------------------------------------------------------
-- 1) AUTH USERS (1000) — DO NOT RUN THIS BLOCK.
--    The dashboard role cannot write auth.users (it fails with
--    42501: must be owner of table users), so the accounts are
--    created through the Auth Admin API instead:
--      node scripts/provision-demo-users.mjs --to 1000 --names supabase/demo-names.json
--    That uses the same uuids, emails and full names as the
--    statement below, and the on_auth_user_created trigger makes
--    each profiles + user_preferences row exactly like a signup.
--    The SQL is kept here as the record of those identities.
-- ------------------------------------------------------------
/*
with pw as (
  select crypt('ConnexaDemo2026!', gen_salt('bf')) as hash
),
gen as (
  select
    i,
    ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id,
    case when i <= 500
      then (array['Chidi','Ngozi','Emeka','Amara','Obinna','Ifeoma','Tunde','Folake','Segun','Aisha','Musa','Halima','Kelechi','Adaeze','Nnamdi','Yewande','Tamuno','Zainab','Ibrahim','Deji','Femi','Kemi','Simbi','Bunmi','Chika'])[((i-1)%25)+1]
      else (array['James','Emily','Michael','Jessica','Daniel','Ashley','Matthew','Olivia','Andrew','Sophia','Joshua','Emma','Ryan','Ava','Brandon','Grace','William','Chloe','Tyler','Hannah','Kevin','Madison','Brian','Riley','Jacob'])[((i-501)%25)+1]
    end as first_name,
    case when i <= 500
      then (array['Okafor','Adeyemi','Bello','Nwosu','Eze','Chukwu','Balogun','Okonkwo','Yusuf','Abdullahi','Ani','Obi','Danjuma','Adeleke','Igwe','Mallam','Nwachukwu','Salihu','Umeh','Lawal'])[(floor((i-1)/25)::int)+1]
      else (array['Smith','Johnson','Williams','Brown','Jones','Miller','Davis','Garcia','Rodriguez','Wilson','Anderson','Taylor','Thomas','Moore','Jackson','Martin','Lee','Thompson','White','Harris'])[(floor((i-501)/25)::int)+1]
    end as last_name
  from generate_series(1, 1000) i
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
select
  '00000000-0000-0000-0000-000000000000',
  g.id, 'authenticated', 'authenticated',
  lower(g.first_name || '_' || g.last_name || '_' || g.i) || '@connexa1000.test',
  pw.hash,
  now() - (((g.i * 43) % 43200) || ' minutes')::interval,
  now() - (((g.i * 43) % 43200) || ' minutes')::interval,
  now() - (((g.i * 43) % 43200) || ' minutes')::interval,
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', g.first_name || ' ' || g.last_name)
from gen g cross join pw
on conflict (id) do nothing;
*/

-- ------------------------------------------------------------
-- 2) PROFILE ENRICHMENT — bio, location, interests
-- ------------------------------------------------------------
with gen as (
  select
    i,
    ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id,
    i <= 500 as is_ng
  from generate_series(1, 1000) i
)
update public.profiles p
set
  bio = case when g.is_ng then
    (select b from unnest(array[
      'God first, family always.',
      'Lagos running man.',
      'Good food, good mood.',
      'Tech by day, football by evening.',
      'Sapa no be destination.',
      'Entrepreneur in progress.',
      'Jollof is a personality.',
      'Soft life seeker.',
      'Making moves quietly.',
      'Church on Sunday, content all week.',
      'No dulling.',
      'Big boy with big plans.'
    ]) as b order by md5(g.id::text || 'bio') limit 1)
  else
    (select b from unnest(array[
      'Coffee, code and weekend hikes.',
      'Just here to share the good stuff.',
      'Music lover, dog dad, part-time chef.',
      'Big on books and bigger on bagels.',
      'Chasing sunsets and deadlines.',
      'Simple life, strong coffee.',
      'Weekend warrior, weekday dreamer.',
      'Building things and breaking bread.',
      'Sports, stats and strong opinions.',
      'Photography hobbyist.',
      'Here for the reels, staying for the memes.',
      'Plant parent to fourteen.'
    ]) as b order by md5(g.id::text || 'bio') limit 1)
  end,
  location = case when g.is_ng then
    (select l from unnest(array['Lagos','Abuja','Port Harcourt','Ibadan','Kano','Enugu','Benin City','Jos']) as l
     order by md5(g.id::text || 'loc') limit 1)
  else
    (select l from unnest(array['New York','Los Angeles','Chicago','Houston','Phoenix','Seattle','Boston','Denver','Miami','Austin']) as l
     order by md5(g.id::text || 'loc') limit 1)
  end,
  interests = array[
    (select v from unnest(array['music','football','tech','travel','food','photography','movies','gaming','fitness','art','fashion','reading']) as v
     order by md5(g.id::text || 'a') limit 1),
    (select v from unnest(array['music','football','tech','travel','food','photography','movies','gaming','fitness','art','fashion','reading']) as v
     order by md5(g.id::text || 'b') limit 1)
  ]
from gen g
where p.id = g.id;

-- ------------------------------------------------------------
-- 3) FRIENDSHIPS — every account is friends with you, both
--    directions, like the accept-request flow creates.
-- ------------------------------------------------------------
with admin as (select id from public.profiles where is_admin order by created_at limit 1),
gen as (
  select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id, i
  from generate_series(1, 1000) i
)
insert into public.friendships (user_id, friend_id, created_at)
select a.id, g.id, now() - ((g.i % 40320) || ' minutes')::interval
from gen g cross join admin a
union all
select g.id, a.id, now() - ((g.i % 40320) || ' minutes')::interval
from gen g cross join admin a
on conflict (user_id, friend_id) do nothing;

-- ------------------------------------------------------------
-- 4) POSTS — 2 per account, 3-in-4 public and 1-in-4
--    friends-only, spread over the last 7 days. Skipped for
--    authors who already have their own posts.
-- ------------------------------------------------------------
with gen as (
  select
    i,
    ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id,
    i <= 500 as is_ng
  from generate_series(1, 1000) i
),
ng_txt as (
  select array[
    'Morning grind done. Day 1 of showing up every day.',
    'This jollof debate needs to end: party jollof wins, full stop.',
    'Sundays for family, rice and no notifications.',
    'Finished 5k before 6am. The city was still sleeping.',
    'Small up small, na God do am. Grateful for this week.',
    'New recipe experiment turned into chef experience today.',
    'Lagos traffic outside my window, peace inside my head.',
    'Finally sorted my desk setup. Now the work can begin.',
    'No be everything we go answer. Protect your energy.',
    'Match of the day and my boys did not disappoint.',
    'Church service, family call, long walk. Sunday done correct.',
    'Trying this side hustle thing seriously. Day 12.',
    'Rain again. If you know, you know.',
    'Old photos today. 2019 me would be proud of now me.',
    'Soft life is not bought, it is planned.',
    'Book finished in two nights. Ask me about it.'
  ] as t
),
us_txt as (
  select array[
    'First coffee, then the gym, then the inbox. Order matters.',
    'Weekend project: the bookshelf finally lives.',
    'Anyone else run on pure podcasts and stubbornness?',
    'Sunrise over the lake this morning. No filter needed.',
    'Tried the new ramen spot downtown. Ten out of ten, zero regrets.',
    'Home office redeploy complete. Productivity: cautiously optimistic.',
    'Forty-two miles this week. Slowly but surely.',
    'Sunday roast, Sunday football, Sunday nap. Balanced diet.',
    'Reading Atomic Habits for the second time. It sticks now.',
    'Farmers market haul: too much basil, no regrets.',
    'Playlist for a rainy drive is 90 percent of why rain exists.',
    'Made sourdough. Looks like a frisbee, tastes like victory.',
    'Road trip mode: cooler in the back, aux cord in the front.',
    'Two years of morning pages done. The streak is weirdly the point.',
    'Backyard grill championship (family of one) opens Saturday.',
    'Finished the season in one sitting. Send help and recommendations.'
  ] as t
)
insert into public.posts (author_id, content, visibility, created_at)
select
  g.id,
  case when g.is_ng
    then (ng_txt.t)[((g.i * 7 + s.n) % 16) + 1]
    else (us_txt.t)[((g.i * 7 + s.n) % 16) + 1]
  end,
  case when g.i % 4 = 0 then 'friends' else 'public' end,
  now() - ((abs(hashtext(g.id::text || s.n::text)) % 10080) || ' minutes')::interval
from gen g
cross join generate_series(1, 2) s(n)
cross join ng_txt
cross join us_txt
where not exists (
  select 1 from public.posts q
  where q.author_id = g.id and q.is_shared = false and q.group_id is null
);

-- ------------------------------------------------------------
-- 5) MEDIA — every 4th account gets one photo on their newest
--    post (external picsum URLs — pure demo browsing)
-- ------------------------------------------------------------
with gen as (
  select i, ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id
  from generate_series(1, 1000) i where i % 4 = 0
)
insert into public.post_media (post_id, url, type, position)
select distinct on (p.author_id) p.id,
  'https://picsum.photos/seed/connexa' || g.i || '/800/600',
  'image', 0
from gen g
join public.posts p on p.author_id = g.id and p.is_shared = false and p.group_id is null
where not exists (select 1 from public.post_media m where m.post_id = p.id)
order by p.author_id, p.created_at desc;

-- ------------------------------------------------------------
-- 6) REACTIONS — friends react across the newest posts
--    (yours included), weighted toward like/love like Facebook.
-- ------------------------------------------------------------
with gen as (
  select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id
  from generate_series(1, 1000) i
),
recent as (
  (select p.id, p.author_id from public.posts p
    where p.visibility = 'public' and p.is_shared = false and p.group_id is null
      and p.created_at > now() - interval '8 days'
    order by p.created_at desc limit 150)
  union
  (select p.id, p.author_id from public.posts p
    where p.author_id = (select id from public.profiles where is_admin order by created_at limit 1)
      and p.visibility = 'public' and p.is_shared = false and p.group_id is null)
),
pairs as (
  select r.id as post_id, r.author_id, a.id as user_id
  from recent r cross join gen a
  where a.id <> r.author_id
    and abs(hashtext(r.id::text || a.id::text)) % 11 = 0
)
insert into public.reactions (user_id, post_id, type)
select user_id, post_id,
  case abs(hashtext(user_id::text || post_id::text)) % 10
    when 0 then 'like' when 1 then 'like' when 2 then 'like'
    when 3 then 'love' when 4 then 'love' when 5 then 'love'
    when 6 then 'haha' when 7 then 'wow' when 8 then 'sad'
    else 'angry'
  end
from pairs
on conflict (user_id, post_id) do nothing;

-- ------------------------------------------------------------
-- 7) COMMENTS
-- ------------------------------------------------------------
with gen as (
  select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id
  from generate_series(1, 1000) i
),
recent as (
  (select p.id, p.author_id from public.posts p
    where p.visibility = 'public' and p.is_shared = false and p.group_id is null
      and p.created_at > now() - interval '8 days'
    order by p.created_at desc limit 100)
  union
  (select p.id, p.author_id from public.posts p
    where p.author_id = (select id from public.profiles where is_admin order by created_at limit 1)
      and p.visibility = 'public' and p.is_shared = false and p.group_id is null)
)
insert into public.comments (post_id, author_id, content, created_at)
select r.id, a.id,
  (select t from unnest(array[
    'This is exactly what I needed today, thank you!',
    'Love this, fire emoji honestly',
    'So true!',
    'Great shot, seriously',
    'Haha this made my day',
    'Could not agree more',
    'Beautiful work!',
    'Where was this taken?',
    'Sharing this with my friends',
    'The quality as always',
    'Needed this reminder',
    'Wow, just wow',
    'This deserves more attention',
    'Keep them coming!',
    'Instant favourite',
    'Correct answer!'
  ]) as t order by md5(r.id::text || a.id::text) limit 1),
  now() - ((abs(hashtext(r.id::text || a.id::text)) % 7200) || ' minutes')::interval
from recent r cross join gen a
where a.id <> r.author_id
  and abs(hashtext(r.id::text || a.id::text || 'c')) % 30 = 0
  and not exists (
    select 1 from public.comments c
    where c.post_id = r.id and c.author_id = a.id and c.parent_id is null
  );

-- ------------------------------------------------------------
-- 8) REPOSTS
-- ------------------------------------------------------------
with gen as (
  select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id
  from generate_series(1, 1000) i
),
recent as (
  select p.id, p.author_id from public.posts p
  where p.visibility = 'public' and p.is_shared = false and p.group_id is null
    and p.created_at > now() - interval '8 days'
  order by p.created_at desc limit 60
),
pick as (
  select r.id as original_id,
    (select g.id from gen g where g.id <> r.author_id
     order by md5(r.id::text || g.id::text) limit 1) as reposter_id
  from recent r
  where abs(hashtext(r.id::text || 'repost')) % 3 = 0
)
insert into public.posts (author_id, content, visibility, is_shared, shared_post_id, created_at)
select p.reposter_id, '', 'public', true, p.original_id,
  now() - ((abs(hashtext(p.original_id::text)) % 5760) || ' minutes')::interval
from pick p
where p.reposter_id is not null
  and not exists (
    select 1 from public.posts q
    where q.shared_post_id = p.original_id and q.author_id = p.reposter_id and q.is_shared
  );

-- ------------------------------------------------------------
-- 9) MESSAGES — one conversation between you and every account,
--    three messages each. Their last message is UNREAD, so your
--    Messages badge lights up like a real inbox.
--    First: drop the empty threads the old chat-creation bug left
--    behind (a conversation with nobody in it can never load).
-- ------------------------------------------------------------
delete from public.conversations c
where not exists (
  select 1 from public.conversation_participants p
  where p.conversation_id = c.id
);

with gen as (
  select
    i,
    ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id,
    ('00000000-0000-4000-9000-' || lpad(i::text, 12, '0'))::uuid as conv_id
  from generate_series(1, 1000) i
)
insert into public.conversations (id, last_message_at, created_at)
select g.conv_id,
  now() - ((abs(hashtext(g.id::text || 'c')) % 1440) || ' minutes')::interval,
  now() - ((abs(hashtext(g.id::text)) % 10080) || ' minutes')::interval
from gen g
on conflict (id) do nothing;

with admin as (select id from public.profiles where is_admin order by created_at limit 1),
gen as (
  select
    i,
    ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id,
    ('00000000-0000-4000-9000-' || lpad(i::text, 12, '0'))::uuid as conv_id
  from generate_series(1, 1000) i
)
insert into public.conversation_participants (conversation_id, user_id)
select g.conv_id, a.id from gen g cross join admin a
union all
select g.conv_id, g.id from gen g
on conflict (conversation_id, user_id) do nothing;

-- message 1: opener from them (read)
with gen as (
  select
    i,
    ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id,
    ('00000000-0000-4000-9000-' || lpad(i::text, 12, '0'))::uuid as conv_id,
    i <= 500 as is_ng
  from generate_series(1, 1000) i
)
insert into public.messages (conversation_id, sender_id, content, is_read, created_at)
select
  g.conv_id, g.id,
  case when g.is_ng then
    (array[
      'How far! Long time.',
      'Saw your profile, we should connect properly.',
      'Na you be that guy for the group abi?',
      'Good evening boss. Things calm?',
      'I saw your post this morning, e sweet me die.',
      'Abeg send me that link you posted.'
    ])[(g.i % 6) + 1]
  else
    (array[
      'Hey! Found you through people you may know.',
      'Great profile, that last post was spot on.',
      'Hi! Neighbor of a neighbor, seemed friendly here.',
      'Hey, did you end up going to the game Saturday?',
      'Random, but your photography is genuinely good.',
      'Hello! New here, this app is surprisingly nice.'
    ])[(g.i % 6) + 1]
  end,
  true,
  now() - ((abs(hashtext(g.id::text)) % 10080) || ' minutes')::interval
from gen g
where not exists (select 1 from public.messages m where m.conversation_id = g.conv_id);

-- message 2: your reply (read)
with gen as (
  select
    i,
    ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id,
    ('00000000-0000-4000-9000-' || lpad(i::text, 12, '0'))::uuid as conv_id
  from generate_series(1, 1000) i
),
first_msgs as (
  select m.conversation_id, m.created_at
  from public.messages m
  where m.conversation_id in (select conv_id from gen)
),
admin as (
  select id from public.profiles where is_admin order by created_at limit 1
)
insert into public.messages (conversation_id, sender_id, content, is_read, created_at)
select
  g.conv_id,
  a.id,
  (array[
    'Ha! Good to hear from you.',
    'Appreciate you reaching out.',
    'For real, we should catch up soon.',
    'That made me smile, honestly.',
    'Yes! I was thinking about that.',
    'Ha, you still remember that one.'
  ])[(g.i % 6) + 1],
  true,
  fm.created_at + interval '20 minutes'
from gen g
cross join admin a
join first_msgs fm on fm.conversation_id = g.conv_id
where fm.created_at + interval '20 minutes' < now()
  and not exists (
    select 1 from public.messages m
    where m.conversation_id = g.conv_id
      and m.sender_id = a.id
  );

-- message 3: their last word (UNREAD -> badge)
with gen as (
  select
    i,
    ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id,
    ('00000000-0000-4000-9000-' || lpad(i::text, 12, '0'))::uuid as conv_id,
    i <= 500 as is_ng
  from generate_series(1, 1000) i
),
second_msgs as (
  select m.conversation_id, max(m.created_at) as t
  from public.messages m
  where m.conversation_id in (select conv_id from gen)
  group by m.conversation_id
)
insert into public.messages (conversation_id, sender_id, content, is_read, created_at)
select
  g.conv_id, g.id,
  case when g.is_ng then
    (array[
      'No wahala, talk later!',
      'I hear you. Night boss.',
      'Perfect, send me details.',
      'Na so. Enjoy your day.',
      'Small one, we move.',
      'Alright, I will check.'
    ])[(g.i % 6) + 1]
  else
    (array[
      'Awesome, let''s do it sometime.',
      'Appreciate it, have a good night!',
      'Cool, send me the details?',
      'Haha deal. Talk soon.',
      'Sounds good to me.',
      'Perfect, catch you later.'
    ])[(g.i % 6) + 1]
  end,
  false,
  sm.t + interval '15 minutes'
from gen g
join second_msgs sm on sm.conversation_id = g.conv_id
where sm.t + interval '15 minutes' < now()
  and not exists (
    select 1 from public.messages m
    where m.conversation_id = g.conv_id
      and m.sender_id = g.id
      and m.is_read = false
  );

-- ------------------------------------------------------------
-- 10) STORIES — ~77 accounts have a live story right now
--     (expires in 20 hours).
-- ------------------------------------------------------------
with gen as (
  select i, ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id
  from generate_series(1, 1000) i
  where i % 13 = 3
)
insert into public.stories (author_id, media_url, media_type, caption, expires_at, created_at)
select g.id,
  'https://picsum.photos/seed/cxstory' || g.i || '/600/900',
  'image',
  (select t from unnest(array[
    'Good morning','Weekend mood','On the move','Quick one',
    'Behind the scenes','Golden hour','Today was a lot','Small wins'
  ]) as t order by md5(g.id::text) limit 1),
  now() + interval '20 hours',
  now() - ((abs(hashtext(g.id::text)) % 720) || ' minutes')::interval
from gen g
where not exists (
  select 1 from public.stories s
  where s.author_id = g.id and s.expires_at > now()
);

-- ------------------------------------------------------------
-- 10b) NOTIFICATIONS — the app writes these itself when someone
--      comments or accepts a request, and nothing else creates
--      them, so without this block the Notifications tab and its
--      unread badge stay empty. Anything older than two days is
--      marked read, the way an active account looks.
-- ------------------------------------------------------------
with admin as (
  select id, display_name from public.profiles where is_admin order by created_at limit 1
),
gen as (
  select i, ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id
  from generate_series(1, 1000) i
),
accepted as (
  select g.id as user_id, a.id as actor_id,
    a.display_name || ' accepted your friend request' as message,
    now() - ((abs(hashtext(g.id::text || 'fa')) % 4320) || ' minutes')::interval as t
  from gen g cross join admin a
  union all
  select a.id, g.id,
    p.display_name || ' accepted your friend request',
    now() - ((abs(hashtext(g.id::text || 'fa')) % 4320) || ' minutes')::interval
  from gen g cross join admin a join public.profiles p on p.id = g.id
)
insert into public.notifications (user_id, actor_id, type, entity_id, entity_type, message, is_read, created_at)
select r.user_id, r.actor_id, 'friend_accepted', r.actor_id, 'profile', r.message,
  r.t < now() - interval '2 days', r.t
from accepted r
where not exists (
  select 1 from public.notifications n
  where n.user_id = r.user_id and n.actor_id = r.actor_id and n.type = 'friend_accepted'
);

-- One per seeded comment, addressed to the post author.
insert into public.notifications (user_id, actor_id, type, entity_id, entity_type, message, is_read, created_at)
select p.author_id, c.author_id, 'post_comment', c.post_id, 'post',
  a.display_name || ' commented on your post',
  c.created_at < now() - interval '2 days', c.created_at
from public.comments c
join public.posts p on p.id = c.post_id
join public.profiles a on a.id = c.author_id
where p.author_id <> c.author_id
  and c.parent_id is null
  and not exists (
    select 1 from public.notifications n
    where n.user_id = p.author_id and n.actor_id = c.author_id
      and n.type = 'post_comment' and n.entity_id = c.post_id
  );

-- ------------------------------------------------------------
-- 11) RESULTS — run this file again safely afterwards; counts
--     should read ~1000 / ~1000 / ~2000 / 2000 / ~1000 / ~5000
-- ------------------------------------------------------------
select
  (select count(*) from auth.users where email like '%@connexa1000.test') as auth_users,
  (select count(*) from public.profiles p join auth.users u on u.id = p.id
     where u.email like '%@connexa1000.test') as profiles,
  (select count(*) from public.posts p join auth.users u on u.id = p.author_id
     where u.email like '%@connexa1000.test' and p.is_shared = false) as posts,
  (select count(*) from public.friendships f join auth.users u on u.id = f.friend_id
     where u.email like '%@connexa1000.test') as friend_rows,
  (select count(*) from public.conversations c
     where c.id in (select conv from (
       select ('00000000-0000-4000-9000-' || lpad(i::text, 12, '0'))::uuid as conv
       from generate_series(1, 1000) i ) x)) as conversations,
  (select count(*) from public.notifications
     where type in ('friend_accepted', 'post_comment')) as notifications,
  (select count(*) from public.notifications
     where is_read = false and user_id = (
       select id from public.profiles where is_admin order by created_at limit 1)) as admin_unread;
