export interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

const FEEDS = [
  { channel: "World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { channel: "Top", url: "https://feeds.bbci.co.uk/news/rss.xml" },
];

type Cache = { items: (NewsItem & { channel: string })[]; at: number };
let cache: Cache = { items: [], at: 0 };
const TTL_MS = 10 * 60 * 1000;

function stripCdata(s: string) {
  return s.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
}

function unescapeXml(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? unescapeXml(stripCdata(m[1])) : "";
}

async function fetchFeed(channel: string, url: string): Promise<(NewsItem & { channel: string })[]> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const xml = await res.text();
  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g))
    .slice(0, 8)
    .map((m) => ({
      channel,
      title: tag(m[1], "title"),
      link: tag(m[1], "link"),
      description: tag(m[1], "description"),
      pubDate: tag(m[1], "pubDate"),
    }))
    .filter((i) => i.title && i.link);
}

export async function getBbcNews(): Promise<(NewsItem & { channel: string })[]> {
  if (Date.now() - cache.at < TTL_MS) return cache.items;
  try {
    const results = await Promise.all(FEEDS.map((f) => fetchFeed(f.channel, f.url)));
    const seen = new Set<string>();
    const items: (NewsItem & { channel: string })[] = [];
    for (const list of results) {
      for (const item of list) {
        if (seen.has(item.link)) continue;
        seen.add(item.link);
        items.push(item);
      }
    }
    if (items.length > 0) cache = { items, at: Date.now() };
    return items.length > 0 ? items : cache.items;
  } catch {
    return cache.items;
  }
}

export interface NewsArticle {
  title: string;
  image: string | null;
  paragraphs: string[];
}

// Only the feeds we read ourselves may be opened, so the proxy below can never
// be pointed at an internal address by a crafted link.
const ALLOWED_HOSTS = ["www.bbc.co.uk", "www.bbc.com", "feeds.bbci.co.uk"];

export function isNewsLinkAllowed(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && ALLOWED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

type CacheEntry = { article: NewsArticle; at: number };
const articles = new Map<string, CacheEntry>();
const ARTICLE_TTL_MS = 30 * 60 * 1000;

function metaContent(html: string, property: string) {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`));
  return m ? unescapeXml(m[1]) : "";
}

function plainText(fragment: string) {
  return unescapeXml(
    fragment
      .replace(/<a[^>]*>/gi, "")
      .replace(/<\/a>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
  ).trim();
}

/**
 * Reads the story here instead of sending the reader to another site: the
 * article is fetched on the server and its paragraphs are pulled out of the
 * page, so the whole thing renders inside CONNEXA.
 */
export async function fetchNewsArticle(url: string): Promise<NewsArticle | null> {
  if (!isNewsLinkAllowed(url)) return null;
  const hit = articles.get(url);
  if (hit && Date.now() - hit.at < ARTICLE_TTL_MS) return hit.article;

  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ConnexaBot/1.0)" },
  });
  if (!res.ok) return null;
  const html = await res.text();

  // Everything before the first <article> is navigation and scripts.
  const bodyStart = html.search(/<article[\s>]/i);
  const body = bodyStart >= 0 ? html.slice(bodyStart) : html;
  const bodyEnd = body.search(/<\/article>/i);
  const scope = bodyEnd > 0 ? body.slice(0, bodyEnd) : body;

  // BBC marks up its own structure, so the story can be cut out of the page
  // rather than guessed at: the reporter's words live inside data-block="text",
  // and everything after the first topic or related-links block is a prompt to
  // read something else. Taking that span is what keeps "To play this video…"
  // and the related-headline captions out of the paragraphs below.
  const storyStart = scope.search(/data-block="text"/);
  const storyEnd = scope.search(/data-block="(promoList|topicList|ads)"/);
  const story = storyStart >= 0
    ? scope.slice(storyStart, storyEnd > storyStart ? storyEnd : scope.length)
    : scope;

  const paragraphs: string[] = [];
  const seen = new Set<string>();
  const para = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = para.exec(story)) && paragraphs.length < 60) {
    const text = plainText(match[1]);
    // BBC wraps standfirsts and captions the same way; short lines are usually
    // cookie banners, "read more" prompts or section labels.
    if (text.length < 45) continue;
    if (/^(?:related news|advertising|get more from|sign up|watch:|also read|more on|image source|image caption|to play this video)/i.test(text)) continue;
    if (/enable JavaScript/i.test(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    paragraphs.push(text);
  }

  const title = metaContent(html, "og:title") || tag(html, "title");
  const image = metaContent(html, "og:image");
  const article: NewsArticle = {
    title,
    image: image && /^https:\/\//.test(image) ? image : null,
    paragraphs,
  };
  if (article.paragraphs.length > 0) articles.set(url, { article, at: Date.now() });
  return article;
}
