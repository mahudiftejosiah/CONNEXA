# CONNEXA — Connect. Share. Belong.

A full-stack social networking platform built with Next.js 14, TypeScript, Tailwind CSS, and Supabase.

---

## Tech Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Frontend    | Next.js 14 (App Router), React 18 |
| Language    | TypeScript (strict)               |
| Styling     | Tailwind CSS v3                   |
| Backend     | Supabase (Auth, DB, Storage, Realtime) |
| Database    | PostgreSQL (via Supabase)         |
| Deployment  | Vercel + Supabase Cloud           |

---

## Features

- ✅ Real authentication (register, login, email verification, password reset)
- ✅ User profiles with avatar, cover photo, bio, interests, visibility controls
- ✅ Home feed with pagination and infinite scroll
- ✅ Posts: text, images, video, reactions, comments, share, save
- ✅ Three-tier post visibility: Public / Friends / Only Me (enforced server-side via RLS)
- ✅ Friend requests, friendships, followers, blocking
- ✅ Stories (24-hour expiry enforced at DB level)
- ✅ Short-video Reels feed (vertical scroll, swipe)
- ✅ Real-time private messaging (Supabase Realtime)
- ✅ Groups (public & private, role-based: owner/admin/member)
- ✅ Discover page with suggested people, trending posts, public groups
- ✅ Full-text search (people, posts, groups)
- ✅ Notifications (friend requests, reactions, comments, follows)
- ✅ Saved posts (owner-only collection)
- ✅ Account settings, notification preferences, privacy settings
- ✅ Block/unblock users
- ✅ Admin/moderation dashboard with report management and audit log
- ✅ Dark/light theme with system preference detection
- ✅ Fully responsive: mobile, tablet, desktop
- ✅ Row Level Security on all tables
- ✅ Accessible components (keyboard navigation, ARIA labels, semantic HTML)

---

## Quick Start (Local Development)

### 1. Install dependencies

```bash
cd "C:\Users\MY PC\Documents\CONNEXA"
npm install --legacy-peer-deps
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Note your **Project URL** and **anon/public key** from  
   *Project Settings → API*.
3. Note your **service role key** (keep this secret — server-side only).

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Run database migrations

In the Supabase Dashboard → **SQL Editor**, run each migration file **in order**:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_functions_triggers.sql`
3. `supabase/migrations/003_rls_policies.sql`
4. `supabase/migrations/004_storage_buckets.sql`
5. `supabase/migrations/005_security_fixes.sql`
6. `supabase/migrations/006_fix_profiles_recursion.sql`
7. `supabase/migrations/007_group_policy_recursion.sql`

> ⚠️ Run them in order. Each file depends on the previous one.
> 006 and 007 fix RLS policy recursion (SECURITY DEFINER helper functions for
> `is_admin()`, group membership, and conversation participation checks) and
> must be applied for authenticated pages to load.
> If you previously ran the `002b/003b/004b` fix scripts, run `005_security_fixes.sql`
> afterwards — it re-secures the storage buckets (private post-media/stories with
> signed URLs), closes the comments/media/reactions RLS leak, and rewrites stored
> media URLs to object paths.

### 5. Configure Supabase Auth

In the Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000`
- **Redirect URLs**: Add `http://localhost:3000/api/auth/callback`

For email verification, ensure **Confirm email** is enabled under  
*Authentication → Providers → Email*.

### 6. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Production Deployment (Vercel)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial CONNEXA implementation"
git remote add origin https://github.com/yourusername/connexa.git
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo.
2. Add the following environment variables in Vercel's project settings:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL   (your Vercel deployment URL, e.g. https://connexa.vercel.app)
```

3. Deploy.

### 3. Update Supabase Auth URLs

After getting your Vercel URL, update in Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: Add `https://your-app.vercel.app/api/auth/callback`

---

## Making a User an Admin

Run this SQL in Supabase SQL Editor (replace the email):

```sql
UPDATE public.profiles
SET is_admin = TRUE
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'admin@example.com'
);
```

The admin dashboard is at `/admin` — only accessible to users with `is_admin = true`.

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key — **server-side only** |
| `NEXT_PUBLIC_APP_URL` | ✅ | Base URL of the app (for auth redirects) |

---

## TypeScript & Linting

```bash
npm run type-check   # TypeScript type checking
npm run lint         # ESLint
npm run build        # Production build
```

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login, register, forgot-password, reset-password, verify-email
│   ├── (app)/           # Feed, profile, settings, friends, stories, reels, messages,
│   │                    #   groups, discover, notifications, saved
│   ├── admin/           # Admin dashboard (protected)
│   ├── search/          # Search results
│   ├── about/           # Public pages
│   ├── privacy/
│   ├── terms/
│   ├── help/
│   ├── contact/
│   └── api/             # Auth callback, conversations
├── components/
│   ├── brand/           # Logo
│   ├── layout/          # Navbar, Sidebar, MobileNav, Footer, AppLayout
│   ├── posts/           # PostCard, CreatePost, CommentSection
│   └── ui/              # Button, Input, Avatar, Modal, Skeleton, EmptyState, ThemeToggle
├── lib/
│   ├── actions/         # Server actions: posts, friends, profile
│   ├── supabase/        # client.ts, server.ts, auth.ts, types.ts
│   └── utils.ts
└── middleware.ts        # Auth-based route protection
supabase/
└── migrations/          # SQL migration files (run in order)
```

---

## Known Limitations & Incomplete Features

The following items require additional work or external configuration:

1. **Email delivery**: Requires a configured email provider in Supabase (SMTP settings under Authentication → SMTP Settings). Without it, verification and password-reset emails won't send.

2. **Push notifications**: The architecture is ready (notifications table, realtime subscriptions) but browser push (service worker + Web Push API) is not yet implemented.

3. **Audio/video calling**: Planned for a future release. Not implemented.

4. **Automated story cleanup**: Stories expire at the DB query level (RLS checks `expires_at > NOW()`). A scheduled Supabase Edge Function or pg_cron job should be added to physically delete expired rows.

5. **Full-text search**: Uses `ilike` pattern matching. For production, replace with Supabase's `fts` (full-text search) using `tsvector` columns.

6. **File upload size limits**: Enforced client-side and via bucket settings. For large video uploads, consider Supabase's resumable upload API.

7. **Rate limiting**: Not implemented at the application layer. Supabase's built-in rate limits apply. For production, add middleware-level rate limiting.

8. **Account deletion**: Submits a deletion request and logs out. A Supabase Edge Function or cron job should complete the actual deletion from `auth.users`.

9. **Group invitations for private groups**: Private group joining requires owner/admin to manually add members via SQL. A UI invite flow is not yet built.

---

## License

MIT — see LICENSE file.
