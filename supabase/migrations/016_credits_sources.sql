-- ------------------------------------------------------------
-- 016 — Credits: attribute every external source
--
-- Rewrites the 'credits' row in site_content so the public site
-- lists every service that supplied material (games, books, covers,
-- video embeds, news, images, fonts, icons).
--
-- Paste the whole file in Supabase → SQL Editor → Run.
-- Safe to re-run: it overwrites the same row. The last SELECT shows
-- the new body so you can confirm it landed.
-- ------------------------------------------------------------

INSERT INTO public.site_content (key, title, body) VALUES
('credits','Credits',$$CONNEXA — Credits

Built and maintained with care, on top of free and open services. Every source
that supplied material you can see on this site is listed below.

TECHNOLOGY
• Next.js and React — the application framework
• Supabase — database, login, storage and realtime
• Vercel — hosting and deployment
• Tailwind CSS — layout and styling
• lucide-react — the icons used across the site
• Inter — interface typeface, served by Google Fonts

GAMES
• CrazyGames (games.crazygames.com) — the 3D titles in "Trending 3D" open
  through their official free-to-embed player. Game code, artwork and content
  belong to their original developers.
• The 2D games under the Games tab are written from scratch for CONNEXA.
• Google favicon service (www.google.com/s2/favicons) — logos for external
  game and site cards.

STUDY ROOM
• Project Gutenberg (www.gutenberg.org) — the free e-book library behind the
  book list and PDF links.
• Open Library (openlibrary.org and covers.openlibrary.org) — book cover
  images shown in the Study Room grid.
• Learning shortcuts link out to Khan Academy, MIT OpenCourseWare, Coursera,
  Duolingo, freeCodeCamp, Quizlet, Encyclopaedia Britannica, Wikipedia and
  Google Scholar.

VIDEO AND REELS
• YouTube (thumbnails from img.youtube.com, player at
  www.youtube-nocookie.com) — official embeds.
• TikTok (www.tiktok.com/embed/v2) — official embed.
Every reel stays owned by the creator who posted it; CONNEXA only embeds what
those platforms already allow to be embedded.

NEWS, SPORT AND ODDS
• BBC News (feeds.bbci.co.uk) — headlines in the Discover feed.
• Sports shortcuts: ESPN, Flashscore, LiveScore, Sofascore, FotMob.
• Betting shortcuts: SportyBet, NairaBet, Bet9ja, BetKing, Premier Bet Nigeria.

REFERENCE TEXTS
• BibleGateway (www.biblegateway.com) and Quran.com — holy book links.

DEMO IMAGES AND AVATARS
• picsum.photos — placeholder photography used in sample posts and stories.
• ui-avatars.com — generated fallback profile avatars.

COMMUNITY
• DMFtech — powering CONNEXA
• Our early members, testers and bug hunters

All trademarks, games, books, videos, articles and images belong to their
respective owners. CONNEXA links to material those services publish publicly;
it does not host it and does not claim it. If you own something shown here and
would rather it not appear, send an admin a message and it will be removed.

Want to be listed here? An admin can add you on the Credits page.$$)
ON CONFLICT (key) DO UPDATE
SET title = EXCLUDED.title,
    body  = EXCLUDED.body;

SELECT key, title, LENGTH(body) AS body_length, updated_at
FROM public.site_content
WHERE key = 'credits';
