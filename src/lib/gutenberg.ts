// Project Gutenberg publishes a title in several shapes, and not every title
// has every shape. The Study Room reader needs paragraphs it can page through
// itself, because only a page the app draws can remember where a reader stopped.
// So the plain-text editions are tried first and the HTML editions second; a
// title that exists only as a scan is reported honestly rather than spun on.
const GUTENBERG_ID = /gutenberg\.org\/(?:ebooks\/(\d+)|files\/(\d+)\/)/;

export function gutenbergId(url: string): string | null {
  const m = GUTENBERG_ID.exec(url);
  if (!m) return null;
  return m[1] || m[2] || null;
}

const CACHE_MS = 6 * 60 * 60 * 1000;
// A failure is remembered briefly too, so a room full of readers opening the
// same unavailable title does not turn into a request per reader per second.
const MISS_MS = 2 * 60 * 1000;
const FETCH_MS = 12000;
// Six candidates at twelve seconds each would outlast the reader's own patience,
// so the whole hunt shares one budget and answers before the reader gives up.
const BUDGET_MS = 30000;

export type BookText =
  | { ok: true; paragraphs: string[]; format: "text" | "html"; url: string }
  | { ok: false; reason: "unavailable" | "missing" };

type Entry = { at: number; result: BookText };
const cache = new Map<string, Entry>();

// The naming schemes Gutenberg has used over the years, in the order that is
// most likely to succeed. Every one of these is a real public path.
function candidates(id: string): { url: string; kind: "text" | "html" }[] {
  return [
    { url: `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`, kind: "text" },
    { url: `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt.utf-8`, kind: "text" },
    { url: `https://www.gutenberg.org/files/${id}/${id}-0.txt`, kind: "text" },
    { url: `https://www.gutenberg.org/cache/epub/${id}/pg${id}.html`, kind: "html" },
    { url: `https://www.gutenberg.org/files/${id}/${id}-h/${id}-h.htm`, kind: "html" },
    { url: `https://www.gutenberg.org/files/${id}/${id}-h.htm`, kind: "html" },
  ];
}

// Gutenberg wraps the book between two banner lines; everything outside them is
// the licence and the transcription notes. The line just under the opening
// banner names the transcribers, so the text only starts at the first blank
// line after it.
function stripFrontMatter(raw: string) {
  const text = raw.replace(/\r\n?/g, "\n"); // Gutenberg files are CRLF
  const start = text.indexOf("*** START OF");
  const from = start >= 0 ? start : 0;
  const end = text.indexOf("*** END OF", from);
  let body = text.slice(from, end > from ? end : text.length);
  const firstBlank = body.search(/\n[ \t]*\n/);
  if (firstBlank >= 0) body = body.slice(firstBlank + 1);
  return body;
}

function toParagraphs(body: string): string[] {
  const out = body
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2029\f]/g, "\n\n") // form feeds are Gutenberg's page breaks
    .split(/\n{2,}/)
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter((p) => p.length > 0 && !/^\W{0,3}$/.test(p) && !/^End of the Project Gutenberg/i.test(p));
  // The credit line that names the transcribers lands where page one should be.
  while (out.length && /^Produced by\b/i.test(out[0])) out.shift();
  return out;
}

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "\u2014", ndash: "\u2013", hellip: "\u2026",
  rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201D", ldquo: "\u201C",
  laquo: "\u00AB", raquo: "\u00BB", deg: "\u00B0", copy: "\u00A9",
  reg: "\u00AE", trade: "\u2122", middot: "\u00B7", bull: "\u2022",
  eacute: "\u00E9", egrave: "\u00E8", agrave: "\u00E0", ccedil: "\u00E7",
  uuml: "\u00FC", ouml: "\u00F6", auml: "\u00E4", szlig: "\u00DF",
  ntilde: "\u00F1", ocirc: "\u00F4", ecirc: "\u00EA", acirc: "\u00E2",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeChar(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeChar(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => NAMED[name.toLowerCase()] ?? whole)
    .replace(/&amp;/gi, "&");
}

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 9 || code > 0x10ffff) return "";
  if (code === 10 || code === 13) return "\n";
  try { return String.fromCodePoint(code); } catch { return ""; }
}

// The HTML editions are read as text, never rendered: tags become paragraph
// boundaries and everything else is dropped, so what reaches the reader is the
// same plain string the text editions produce.
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article|pre|td)>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  );
}

function enough(paragraphs: string[]): boolean {
  // A short tale is still a book, so the test is whether any real reading
  // matter came back, not how many paragraphs it happened to have.
  return paragraphs.length >= 2 && paragraphs.join("").length >= 600;
}

export async function bookText(id: string, force = false): Promise<BookText> {
  const hit = cache.get(id);
  if (hit) {
    const life = hit.result.ok ? CACHE_MS : MISS_MS;
    if (!force && Date.now() - hit.at < life) return hit.result;
  }

  let unavailable = false;
  const startedAt = Date.now();
  for (const candidate of candidates(id)) {
    const left = BUDGET_MS - (Date.now() - startedAt);
    if (left <= 0) { unavailable = true; break; }
    let text: string;
    try {
      const res = await fetch(candidate.url, {
        signal: AbortSignal.timeout(Math.min(FETCH_MS, left)),
        headers: { "user-agent": "CONNEXA study room (reading aid)" },
        cache: "no-store",
      });
      // Gutenberg answers the whole site with one maintenance page when it is
      // down. That is not a missing book, and saying so would be a lie.
      if (res.status === 503 || res.status === 502 || res.status === 504) {
        unavailable = true;
        break;
      }
      if (!res.ok) continue;
      text = await res.text();
    } catch {
      // One naming scheme failing is normal — the next is tried.
      continue;
    }
    if (/Temporarily Down for Maintenance/i.test(text)) {
      unavailable = true;
      break;
    }
    const body = candidate.kind === "html" ? htmlToText(text) : text;
    const paragraphs = toParagraphs(stripFrontMatter(body));
    if (!enough(paragraphs)) continue;
    const result: BookText = { ok: true, paragraphs, format: candidate.kind, url: candidate.url };
    cache.set(id, { at: Date.now(), result });
    return result;
  }

  const result: BookText = { ok: false, reason: unavailable ? "unavailable" : "missing" };
  cache.set(id, { at: Date.now(), result });
  return result;
}