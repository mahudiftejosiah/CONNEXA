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
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
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
