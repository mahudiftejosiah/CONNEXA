-- ============================================================
-- CONNEXA — realistic feed activity seed (run in SQL Editor)
-- Adds reactions, comments and reposts from demo accounts onto
-- the most recent public posts so the feed feels alive.
-- Safe to re-run: existing activity is not duplicated.
-- ============================================================

-- 1) REACTIONS (weighted toward Like/Love like Facebook) ----------
insert into public.reactions (user_id, post_id, type)
with recent_posts as (
  select p.id, p.author_id
  from public.posts p
  where p.visibility = 'public' and p.is_shared = false and p.group_id is null
  order by p.created_at desc
  limit 80
),
actors as (
  select pr.id
  from public.profiles pr
  where pr.username <> 'mahudiftefreeman'
),
pairs as (
  select rp.id as post_id, rp.author_id, a.id as user_id
  from actors a
  cross join recent_posts rp
  where a.id <> rp.author_id
)
select user_id, post_id,
  case abs(hashtext(user_id::text || post_id::text)) % 10
    when 0 then 'like' when 1 then 'like' when 2 then 'like'
    when 3 then 'love' when 4 then 'love' when 5 then 'love'
    when 6 then 'haha' when 7 then 'wow' when 8 then 'sad'
    else 'angry'
  end
from pairs
where abs(hashtext(post_id::text || user_id::text || 'sample')) % 5 = 0
on conflict (user_id, post_id) do nothing;

-- 2) COMMENTS (short, friendly, varied) ---------------------------
insert into public.comments (post_id, author_id, content)
with recent_posts as (
  select p.id, p.author_id
  from public.posts p
  where p.visibility = 'public' and p.is_shared = false and p.group_id is null
  order by p.created_at desc
  limit 60
),
actors as (
  select pr.id
  from public.profiles pr
  where pr.username <> 'mahudiftefreeman'
),
texts(t) as (
  select unnest(array[
    'This is exactly what I needed today, thank you!',
    'Love this 🔥',
    'So true!',
    'Great shot 😍',
    'Haha this made my day',
    'Couldn''t agree more',
    'Beautiful work!',
    'Where was this taken?',
    'Sharing this with my friends',
    'The quality as always 👏',
    'Needed this reminder',
    'Wow 😮',
    'This deserves more attention',
    'Keep them coming!',
    'Instant favourite',
    'Came here from the repost, not disappointed'
  ])
)
select rp.id, a.id,
  (select t from texts order by md5(rp.id::text || a.id::text) limit 1)
from recent_posts rp
cross join actors a
where a.id <> rp.author_id
  and abs(hashtext(rp.id::text || a.id::text)) % 18 = 0
  and not exists (
    select 1 from public.comments c
    where c.post_id = rp.id and c.author_id = a.id and c.parent_id is null
  );

-- 3) REPOSTS -------------------------------------------------------
insert into public.posts (author_id, content, visibility, is_shared, shared_post_id)
with recent_posts as (
  select p.id, p.author_id
  from public.posts p
  where p.visibility = 'public' and p.is_shared = false and p.group_id is null
  order by p.created_at desc
  limit 40
),
pick as (
  select rp.id as original_id,
    (select pr.id from public.profiles pr
      where pr.id <> rp.author_id and pr.username <> 'mahudiftefreeman'
      order by md5(rp.id::text || pr.id::text) limit 1) as reposter_id
  from recent_posts rp
  where abs(hashtext(rp.id::text || 'repost')) % 3 = 0
)
select p.reposter_id,
  '',
  'public',
  true,
  p.original_id
from pick p
where p.reposter_id is not null
  and not exists (
    select 1 from public.posts q
    where q.shared_post_id = p.original_id and q.author_id = p.reposter_id and q.is_shared
  );
