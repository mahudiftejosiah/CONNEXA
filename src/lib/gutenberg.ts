// Project Gutenberg publishes every title it hosts as a plain-text file. The
// Study Room reader needs that text rather than the PDF, because only a page
// the app draws itself can tell where a reader stopped and return them there.
const GUTENBERG_ID = /gutenberg\.org\/(?:ebooks\/(\d+)|files\/(\d+)\/)/;

export function gutenbergId(url: string): string | null {
  const m = GUTENBERG_ID.exec(url);
  if (!m) return null;
  return m[1] || m[2] || null;
}

const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; paragraphs: string[] }>();

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
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^\W{0,3}$/.test(p) && !/^End of the Project Gutenberg/i.test(p));
  // The credit line that names the transcribers lands where page one should be.
  while (out.length && /^Produced by\b/i.test(out[0])) out.shift();
  return out;
}

export async function bookParagraphs(id: string): Promise<string[] | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.paragraphs;

  for (const path of [`pg${id}.txt`, `pg${id}.txt.utf-8`]) {
    try {
      const res = await fetch(`https://www.gutenberg.org/cache/epub/${id}/${path}`, {
        signal: AbortSignal.timeout(30000),
        headers: { "user-agent": "CONNEXA study room" },
      });
      if (!res.ok) continue;
      const text = await res.text();
      const paragraphs = toParagraphs(stripFrontMatter(text));
      // A short tale is still a book, so the test is whether any real reading
      // matter came back, not how many paragraphs it happened to have.
      if (paragraphs.length < 2 || paragraphs.join("").length < 600) continue;
      cache.set(id, { at: Date.now(), paragraphs });
      return paragraphs;
    } catch {
      // one naming scheme failing is normal — the other is tried
    }
  }
  return null;
}
