# CONNEXA — project guide for AI assistants and other IDEs

**Read this before changing anything.** This file exists so a model or editor (Kiro, Cursor,
Windsurf, Copilot, Claude, Qoder…) can pick the project up cold and continue the work without
breaking a feature that is live in production. It is deliberately blunt about the things that are
invisible in the code: how deploys really happen, which database changes have not been applied yet,
and which "obvious fixes" have already been tried and rejected.

---

## 0. What this project is

CONNEXA ("Connect. Share. Belong.") is a full-stack social network: feed, posts, stories, reels,
DMs, groups, friends/follows, notifications, search, a 3D-game arcade, a Study Room (books +
reader), a live-broadcast section, a two-bot system (helper bot + "Hashing" bot), a PRO membership
tier with its own entertainment/creator features, and an admin console.

- Solo builder/owner. Works conversationally in features, not tickets, and expects the assistant to
  execute end-to-end: code → type check → commit → push → confirm the deploy → verify in a browser.
- Production URL: **https://connexa-delta.vercel.app** (Vercel auto-deploys branch `main`).
- Source of truth: **https://github.com/mahudiftejosiah/CONNEXA.git** (`origin`).
- Database + auth + storage: one Supabase cloud project. The README at the repo root is the
  original scaffold document and is **stale** (it only lists migrations 001–007). This file and the
  SQL in `supabase/` are current.

### How the owner wants to be worked with

- Do not ask for permission for ordinary local work — edits, type checks, commits, pushes to `main`.
  Just do it and report what happened.
- Anything that touches the **database** is the one exception: see §3. You never run it yourself.
- Keep edits scoped. A bug fix does not need surrounding cleanup, and nothing should be built for a
  hypothetical future requirement.
- Explain in plain language. No jargon walls, no internal identifiers in user-facing prose.
- Never hide or shrink the CONNEXA wordmark to make a header fit. That is an explicit standing rule;
  solve overflow some other way.

---

## 1. Commands that actually work on this machine

```bash
npm run dev            # Next dev server — DOES NOT BIND PORT 3000 on this machine (see §2)
npm run build          # production build (slow; the real gate is Vercel)
npx tsc -p tsconfig.check.json --noEmit   # the type check to use
npm run lint           # next lint
```

- `tsconfig.check.json` is a two-file trick: `{ "extends": "./tsconfig.json", "include":
  ["next-env.d.ts","src/**/*.ts","src/**/*.tsx"], "exclude": ["node_modules",".next"] }`. It exists
  because the main `tsconfig.json` pulls in generated `.next/types/*`, which on this Windows box are
  NUL-filled and make `npm run type-check` fail or lie. If the file is missing, recreate it from
  that snippet. It is intentionally **untracked** — do not commit it.
- Every Bash invocation here prints a spurious final line
  `/c/Users/.../qoder-XXXX-cwd: No such file or directory` and an "Exit code 1" that does not reflect
  the command. Trust the real output, not the exit code.
- Long `grep -r` over the repo root scans `.next/` + `node_modules/` and hangs. Search `src`,
  `supabase`, `scripts` explicitly, or use the IDE's own search.

## 2. Deployment reality (non-obvious, and easy to get wrong)

- **GitHub → Vercel auto-deploy** is the pipeline. Commit to `main`, push, and Vercel builds it.
- There is **no `gh` CLI** on this machine, and `vercel` CLI commands abort silently. To learn
  whether a push went live, read the GitHub commit-status API for the pushed SHA:
  `https://api.github.com/repos/mahudiftejosiah/CONNEXA/commits/<sha>/status` — look for the
  `Vercel` check with `state: success` and `"Deployment has completed"`.
- **`localhost:3000` is not usable for testing** — `next dev` no longer binds the port here. All
  browser verification happens on the production Vercel URL after the deploy reports success.
- Environment variables live in Vercel project settings, not in the repo (`.env*` is gitignored):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_APP_URL`. Never print or commit them.
- `next.config.mjs` sets `experimental.serverActions.bodySizeLimit = "4mb"` — see §10, item 4. Do not
  remove it; phone photos fail without it.
- `src/middleware.ts` has an exclusion in its matcher for `manifest.webmanifest` and image files.
  Removing that exclusion makes the app installable-PWA metadata come back as a login redirect.

## 3. The database: how any change gets made

**You do not have database access and must not acquire it.** The owner revoked service-role/PAT
scripting for this project. Every schema or data change is delivered as a `.sql` file under
`supabase/`, which the owner pastes into **Supabase Dashboard → SQL Editor** and runs by hand.

Practical consequences:

1. Write the migration, tell the owner which file to paste, and keep going. The feature ships
   **degraded but honest** until the paste happens: every migration-gated path detects the missing
   object and says so in a toast (e.g. `"Has migration 037 been applied?"`,
   `"Uploads need migration 031 (the pro-media bucket)."`). Preserve that pattern.
2. **Never assume a migration was applied.** Ask for the preflight result (§4) instead of guessing.
   A missing table often fails silently, so a feature can look healthy while its schema is absent.
3. Migrations must be **idempotent and paste-safe**: `CREATE TABLE IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` before every `CREATE POLICY`,
   `CREATE OR REPLACE FUNCTION`, and end with `NOTIFY pgrst, 'reload schema';` plus a small `SELECT`
   that lets the owner verify the change in the result pane.
4. RLS policies must avoid self-referential recursion: use the `SECURITY DEFINER` helpers
   (`is_admin()`, `is_blocked()`, `is_conversation_participant()`, group membership checks) rather
   than querying the table a policy is attached to. That is what 005/006/007 established; do not
   re-introduce direct `profiles`/`groups` lookups inside policies.
5. New RPCs must be added by hand to `src/lib/supabase/types.ts` (the `Functions` union). The types
   file is maintained by hand, not generated — an unlisted function makes `.rpc()` fail type check.

### Migration inventory (`supabase/migrations/`, apply in order)

| # | File | What it establishes |
|---|------|---------------------|
| 001 | `001_initial_schema.sql` | core tables: profiles, posts, post_media, comments, reactions, stories, conversations/messages, groups, notifications, reports, saved posts, blocks, preferences |
| 002 / 002b | `002_functions_triggers.sql`, `002b_fix_functions.sql` | triggers + helper functions (unread counters, notification fan-out, activity counters) |
| 003 / 003b | `003_rls_policies.sql`, `003b_rls_fixed.sql` | baseline RLS for every table |
| 004 / 004b | `004_storage_buckets.sql`, `004b_storage_fixed.sql` | buckets `avatars`, `covers`, `post-media`, `stories`, `groups` + storage policies |
| 005 | `005_security_fixes.sql` | makes `post-media`/`stories` private (signed URLs), closes comment/media/reaction leaks, rewrites stored URLs to object paths |
| 006 / 007 | `006_fix_profiles_recursion.sql`, `007_group_policy_recursion.sql` | `SECURITY DEFINER` helpers that end RLS recursion (`is_admin`, membership, participant checks) |
| 008 | `008_admin_post_update.sql` | admin `posts_update` policy |
| 009 | `009_site_content_themes_games.sql` | `site_content`, `site_settings`, `external_games` |
| 010 | `010_voice_posts.sql` | voice-note posts, raises bucket limits |
| 011 | `011_unread_message_count.sql` | `unread_message_count()` RPC |
| 012 | `012_study_room_reel_embeds.sql` | `reel_embeds`, `study_resources` |
| 013 | `013_study_sites_games_upgrade.sql` | `study_books`, `site_shortcuts`, `game_scores`, `game_requests`, `account_upgrades`, `apply_upgrade_verified()` |
| 014 | `014_assistant_bot.sql` | `bot_flags` (helper-bot auto-moderation) |
| 015 | `015_chat_attachments.sql` | `messages.attachment_*` columns + private `chat-files` bucket |
| 016 / 021 | `016_credits_sources.sql`, `021_credit_wikipedia.sql` | rewrites the `credits` row of `site_content` (021 adds the Project Gutenberg/Wikipedia mention) |
| 017 | `017_view_once_media.sql` | `messages.view_once` + a trigger that freezes those columns |
| 018 | `018_study_progress.sql` | `study_progress` (page position per book) |
| 019 | `019_delete_chat_per_reader.sql` | `conversation_participants.deleted_at` (per-reader delete) |
| 020 | `020_book_descriptions.sql` | `study_books.description` |
| 022 | `022_live_sessions.sql` | `live_sessions` + `live` bucket (Go Live) |
| 023 | `023_message_actions.sql` | `edited_at`/`deleted_at`/`pinned_at`/`pinned_by`, `delete_message_for_everyone(uuid)` |
| 024 | `024_study_highlights.sql` | `study_book_highlights` |
| 025 | `025_featured_sites.sql` | `site_shortcuts.published` + starter featured rows |
| 026 | `026_worldwide_location.sql` | `profiles.country_code/state_code/city` |
| 027 | `027_display_followers_pro_state.sql` | `display_followers`, `pro_expires_at`, `profiles_guard_privileges` trigger |
| 028 | `028_hashing_bot_usage.sql` | `hashing_usage` |
| 029 | `029_pro_core.sql` | `pro_features`, `is_pro(uuid,text)`, `profile_visits`, `post_views` |
| 030 | `030_pro_community.sql` | `daily_questions`, `confessions`, `polls`/`poll_options`/`poll_votes`, `blocked_hashtags` |
| 031 | `031_pro_entertainment_creator.sql` | `quizzes`, `music_tracks`, `events`, `badges`, `listings` + **`pro-media` bucket** |
| 032 | `032_pro_admin.sql` | `stream_permissions`, `stream_allowed(uuid)` |
| 033 | `033_pro_gaps.sql` | `live_messages`, `quiz_duels`, `event_invites`, scheduled streams, track availability, visit opt-out |
| 034 | `034_admin_user_search.sql` | `admin_find_users(text,integer,integer)` |
| 035 | `035_pro_plans.sql` | `pro_plans` + the three published plans |
| 036 | `036_featured_slides.sql` | `featured_slides` (homepage slideshow) |
| 037 | `037_social_upgrades.sql` | `message_reactions`, `story_reactions`, `messages.story_id`, `stories.audience`, `profile_friend_ids()`, the tightened `stories_select` policy |
| 038 | `038_profile_gender.sql` | `profiles.gender` (male/female/other) + the silhouette avatar |
| 039 | `039_stories_upgrade.sql` | story `published_at` + the enforced 24h expiry trigger, `overlay_*` columns, `mark_story_viewed()`, the story realtime publication, `purge_expired_stories()` |

Data/seed files: `seed_profiles_1000.sql` (1000 demo accounts + their posts), `seed_activity.sql`,
`seed_study_books.sql`, `seed_book_covers.sql`, `seed_book_descriptions.sql`; `demo-names.json`
lists the generated names; `scripts/provision-demo-users.mjs` created the Auth side of those accounts.

### `supabase/preflight_migrations.sql` — the oracle

One read-only paste that answers "which of these migrations actually landed?", one row per feature.
**Ask for it before debugging anything that could be a missing migration.** Two rules it encodes,
both learned from a paste that returned nothing:

- Column probes use `pg_attribute` with `attrelid = to_regclass('public.x')`. `relid` does not exist
  and the resulting `42703` aborts the whole run.
- Never `count(*)` a table that an un-pasted migration would create — a static reference to a missing
  relation fails at parse time even inside an untaken branch. Those counts go through the file's own
  `connexa_probe_count()` helper (created at the top, dropped at the bottom).

---

## 4. State as of 2026-11-25 — where work stopped

Latest commits (all pushed and confirmed live on Vercel):

- **Stories rebuilt (2026-11-25)** — golden champagne ring everywhere, the composer opens as a
  full-screen sheet with capture/gallery, text position + colour + size and a real upload progress
  bar, the viewer plays one author at a time and opens **in place** (no redirect to `/stories`), and a
  friend's new story reaches the homepage without a refresh. Files: `src/lib/stories.ts`,
  `src/lib/useActiveStories.ts`, `src/components/stories/{StoryRing,StoryViewer,CreateStory,StoriesTray}.tsx`.
- `33788e8` — stories tray now includes the people you follow (not just friends); inbox preview for
  an unsent newest message reads "This message was deleted".
- `652236c` — `preflight_migrations.sql` repaired (it could not run at all before).
- `351b738` — PRO media uploads moved browser→Supabase Storage so audio files stop being rejected.
- `d82bc04` / `940acde` — the Phase-3 social rebuild (chat, stories, K/M/B stats) and the homepage
  slideshow.

**Database pastes still owed** (features coded, deployed, and currently falling back to their
"migration not applied" message): **031**, **037**, **036**, **024**, **022**, and now **039**.
031 matters most — until it lands, no PRO audio/poster/badge upload can persist, and Go Live (022),
book highlights (024) and the homepage slideshow (036) stay switched off. Get the preflight output
first: the owner may have applied some of these already.

**039 is the one that finishes Stories.** Until it is pasted: story text styling is dropped (the
story still publishes), the expiry is worked out by the browser instead of the database, and a new
story only reaches a friend when their page is reloaded — the realtime publication is what makes it
appear on its own. Everything else in the story experience works without it.

There is one uncommitted working change in `supabase/migrations/031_pro_entertainment_creator.sql`
left over from an earlier session. Leave it alone unless the owner asks.

Deliberately deferred (verified still open in the audit of 2026-10-27 — re-check the code, several
neighbours on that old list have since been fixed): delete paths orphan storage objects; the
notifications page marks everything read on GET; reels pool filters client-side and can come back
sparse; conversations/participants `INSERT ... WITH CHECK (TRUE)` lets a user join any conversation
by id; expired story rows are filtered by `expires_at` but never physically deleted (no cron);
account deletion and admin "ban" write rows rather than removing the auth user. Present these as a
menu, do not start them unprompted.

---

## 5. Storage buckets

| Bucket | Created | Visibility | Written by |
|--------|---------|-----------|------------|
| `avatars`, `covers`, `groups` | 004/004b | public | profile image fields (server actions) |
| `post-media`, `stories` | 004/004b, private since 005 | private → **signed URLs** | composer, `CreateStory` |
| `chat-files` | 015 | private | DM attachments (photo/file/voice/sticker) |
| `live` | 022 | private, HLS/segments | Go Live broadcast |
| `pro-media` | 031 | private + read policies | PRO music, event banners, marketplace, badges |

Anything rendered from a private bucket must go through `signStoryMedia` / `signPostMedia` /
`proMediaUrl` in `src/lib/media.ts`. Rows may still hold legacy absolute URLs; those helpers pass
`http…` through untouched — keep that behaviour or old rows break.

## 6. Tables at a glance (67, all under `public`)

Core social: `profiles posts post_media comments reactions stories reels_embeds groups
group_memberships friend_requests friendships followers user_blocks user_preferences notifications
saved_posts conversations conversation_participants messages content_reports moderation_actions
account_upgrades site_content site_settings`.
Study: `study_books study_progress study_book_highlights study_resources`.
Games: `external_games game_scores game_requests`.
Bots: `bot_flags hashing_usage`.
PRO: `pro_features pro_plans badges user_badges playlists playlist_tracks quizzes quiz_questions
quiz_attempts quiz_answers quiz_duels daily_questions daily_question_replies confessions
confession_authors polls poll_options poll_votes events event_attendees event_invites listings
music_tracks live_sessions live_messages stream_permissions profile_visits post_views
featured_slides`.
Engagement: `message_reactions story_reactions story_views blocked_hashtags`.

`src/lib/supabase/types.ts` mirrors all of it by hand. When you add a column or RPC there, edit the
types file in the same commit.

## 7. Front-end architecture

- Next.js **14.2.29 App Router**, React 18, TypeScript strict, Tailwind v3, `next-themes` for
  light/dark, **`react-hot-toast`** (not sonner — `Providers.tsx` mounts `<Toaster/>`).
- Route groups: `(auth)` = login/register/forgot/reset/verify; `(app)` = everything signed-in
  (`feed profile settings friends stories reels messages groups discover notifications saved games
  study live hashing pro`); `admin` + `admin/pro` + `admin/users/[id]`; public pages (`about privacy
  terms help contact cookies search`); `api/*` route handlers (`auth/conversations/geo/news/reels/
  scores/study-text/unread-counts`).
- Pages are **server components that fetch via `createClient()` from `src/lib/supabase/server.ts`
  and hand plain arrays to a `*Client.tsx`** — e.g. `feed/page.tsx` → `FeedClient`, `stories/page.tsx`
  → `StoriesClient`. Keep that shape; don't add new data fetching inside client trees unless the
  feature is genuinely interactive (realtime, uploads).
- `src/middleware.ts` does session refresh, protects non-`PUBLIC_PATHS` routes, and gates the admin
  with two cookies (`adminCookies.ts`): role is cached per-user, and admins live in `/admin` until
  they explicitly "Enter public site". Changing either half can lock the owner out of the panel —
  test both admin and normal flows after touching it.
- Cross-cutting providers: `UnreadProvider` (header badges) and `StoryRingProvider` (the green
  "unseen story" rings sitewide). `StoryRingProvider.refreshStoryRings()` is the event other
  components fire after publishing/viewing a story; use it instead of adding another poll.
- Server actions all live in `src/lib/actions/*.ts` (`posts friends profile admin admin-users
  adminView bot hashing games pro pro-admin slides`). Realtime chat, typing and reactions are done
  from client components with the browser Supabase client.
- Shared logic worth knowing before duplicating: `lib/media.ts` (signed URLs + `uploadProMediaFile`),
  `lib/story-audience.ts` (who fills the stories tray), `lib/slides.ts`, `lib/scores.ts`,
  `lib/news.ts`, `lib/gutenberg.ts`, `lib/stickers.ts`, `lib/bot*.ts`, `lib/pro-analytics.ts`,
  `lib/feed-activity.ts`, `lib/shared-posts.ts`, `lib/reel-pool.ts`, `lib/utils.ts`
  (`formatRelativeTime`, `compactCount`, `safeRedirectPath`).

## 8. Feature map (where to look when you get asked for X)

| Area | Files | Tables / objects | Migration |
|------|-------|------------------|-----------|
| Feed + composer | `feed/*`, `components/posts/*`, `lib/actions/posts.ts` | `posts post_media reactions` | 001, 005 |
| Homepage slideshow | `components/feed/FeaturedSlideshow.tsx`, `lib/slides.ts`, `admin/SlidesPanel.tsx`, `lib/actions/slides-admin.ts` | `featured_slides` | 036 |
| Stories | `stories/*`, `components/stories/*`, `lib/story-audience.ts`, `components/layout/StoryRingProvider.tsx` | `stories story_views story_reactions` | 012, 037 |
| DMs | `messages/*`, `components/messages/*`, `api/conversations` | `conversations messages message_reactions` | 011, 015, 017, 019, 023, 037 |
| Reels | `reels/*`, `api/reels`, `lib/reel-pool.ts` | `reel_embeds` | 012 |
| Profile | `profile/[username]/*`, `components/profile/*`, `lib/actions/profile.ts` | `profiles followers profile_visits` | 026, 027, 029 |
| Friends | `friends/*`, `lib/actions/friends.ts` | `friendships friend_requests followers` | 001 |
| Study Room | `study/*`, `components/study/*`, `lib/gutenberg.ts`, `api/study-text`, `scripts/fetch-book-*` | `study_books study_progress study_book_highlights` | 012, 018, 020, 024 |
| Games | `games/*`, `components/games/*`, `lib/games/*`, `lib/actions/games.ts` | `external_games game_scores game_requests` | 009, 013 |
| Helper bot | `components/messages/HelpThread.tsx`, `lib/help-bot.ts`, `lib/bot.ts`, `admin/AssistantBot.tsx`, `lib/actions/bot.ts` | `bot_flags` | 014 |
| Hashing bot | `hashing/*`, `lib/hashing*.ts`, `admin/HashingBot.tsx` | `hashing_usage` | 028 |
| Live | `live/*`, `components/live/*`, `lib/live.ts`, `games/live/[id]` | `live_sessions live_messages stream_permissions` | 022, 032, 033 |
| PRO member area | `(app)/pro/*` | most `pro_*` tables | 029–035 |
| Admin console | `admin/*`, `lib/actions/admin*.ts`, `lib/actions/pro-admin.ts`, `admin/pro/useRows.tsx` | everything | 008, 034 |

## 9. Test data and accounts

- 1000 demo accounts exist. Login is **email-only** (the form calls `signInWithPassword` directly):
  address = `<username>@connexa1000.test`, password `ConnexaDemo2026!` for all of them.
  Example: `riley_harris_999@connexa1000.test`, `tyler_white_969@connexa1000.test`.
- Only **one admin account exists**: `mahudiftefreeman` (the owner). An assistant cannot click
  through `/admin`. Do not create a second admin. If an admin flow must be checked, write the steps
  as plain numbered instructions and ask the owner to run them.
- Riley (`…_999`) has 46 friends and 0 followers, which makes him useless for testing follow-based
  features. Use a pair that are *not* friends (Riley + Tyler 969) for anything audience-driven.
- Seeded stories are expired by design; to test a story you must create one. Clean up afterwards:
  stories are visible to the whole demo community for 24 hours.

## 10. Non-obvious invariants — breaking any of these breaks a live feature

1. **RLS recursion.** Policies call `SECURITY DEFINER` helpers (005–007). A policy that selects the
   table it protects loops and returns nothing. Authenticated pages depend on this.
2. **Hand-maintained types.** Every `.rpc("name", …)` must exist in `types.ts`'s `Functions` union,
   or type check fails. Same for new columns used in typed queries.
3. **RLS-blocked writes can "succeed" with 0 rows.** Several admin writes report success but change
   nothing when a policy denies them. Check `count`/the returned row, and prefer a `.select()` after
   the write in admin flows.
4. **Upload size.** Server actions cap at `bodySizeLimit` (4 MB) and Vercel caps function payloads at
   4.5 MB. Anything bigger (audio, video, posters) **must** go browser→storage via
   `uploadProMediaFile()` in `lib/media.ts`. Routing large files through a server action is exactly
   the bug that made the admin Music Corner refuse uploads.
5. **Signed URLs, not public URLs** for `post-media`, `stories`, `chat-files`, `live`, `pro-media`;
   and legacy rows may hold absolute URLs — pass those through unchanged.
6. **`view_once` columns are trigger-protected** (017): an ordinary UPDATE on a view-once message
   fails. Unsend (023) deliberately leaves them alone.
7. **Stories audience is enforced by `stories_select` (037)**, not by the query. The tray asks for
   self + friends + followed and lets RLS hide friends-only stories from mere followers. Keep both
   halves: widening the id list without the policy leaks private stories.
8. **`IN()` lists are capped (~100 ids)** in feed/stories/messages because PostgREST builds a GET URL
   and long lists blow the request size. When you add a list query, cap it and let RLS do the rest.
9. **PRO gating is `is_pro(uuid,text)` + `pro_features`** server-side, with `LockedFeaturePreview`
   client-side. Never gate on a client flag alone.
10. **Mobile layout:** `.rail` horizontal-scroll containers are what stop long rows from overflowing
    the viewport (see the 2026-11-04 batch). Never fix an overflow by hiding the wordmark or shrinking
    brand text.
11. **Reposts** (`shared_post`) must be embedded in two steps via `attachSharedPosts` — a single
    self-referential join hits the FK direction bug that was fixed once already.
12. **Project Gutenberg text** is fetched by `lib/gutenberg.ts` in a fixed order of candidate URLs
    (`cache/epub/<id>/pg<id>.txt`, then the `.utf-8` variant, then `files/<id>/<id>-0.txt`, then the
    cached HTML) and served through `api/study-text`. Files are CRLF. A 502 there is usually honest
    (no reachable text for that id) — don't "fix" it by loosening the route or caching the failure.
    Gutenberg itself is intermittently 503 site-wide.
13. **Middleware matcher exclusions** for static/brand assets (§2).
14. **`toast` is `react-hot-toast`.** Adding sonner/toastify for one feature forks the toast styling.

## 11. Verification recipe (the whole loop)

1. `npx tsc -p tsconfig.check.json --noEmit` → must print `TSC_EXIT=0`.
2. Commit with a message that explains *why*, push to `main`.
3. Poll `https://api.github.com/repos/mahudiftejosiah/CONNEXA/commits/<sha>/status` until the Vercel
   check reports `success` / "Deployment has completed".
4. Browser-verify on `https://connexa-delta.vercel.app` with the in-app browser, using the test
   account from §9. Known limits of that browser: it is a hidden tab, so pointer clicks and viewport
   APIs fail — drive interaction with `evaluate_script` (synthetic `.click()`, native value setters +
   `input` events, `form.requestSubmit()`), no screenshots, chained `setTimeout` instead of long
   `setInterval` loops, and keep any script under ~12s because `evaluate_script` times out at 15s.
   Hidden-page timers are throttled: expect story auto-advance, polling refetches and toasts to lag,
   and read state in the same script that triggered it.
5. Network on this machine intermittently fails DNS (`ERR_NAME_NOT_RESOLVED`), which surfaces as a
   ChunkLoadError "Application error" page. Reload before concluding the app is broken.
6. Clean up anything you created (test stories, follows, posts). Say so in the report.

## 12. House rules for files

- Never commit `.env*`, service-role keys, or anything printed from them.
- Keep these **untracked**: `.tmp/`, `vibe_images/`, `tsconfig.check.json`, `*.tsbuildinfo`, logs.
- Don't commit `README.md`'s outdated migration list as if it were current; if you touch it, correct
  it or point to §3 of this file.
- One feature per commit where practical; a commit that both changes a migration and changes UI
  should say which paste the owner owes.
- If you learn something that would waste the next session's time (a machine quirk, a rejected
  approach, a paste that is still owed), write it into this file.
