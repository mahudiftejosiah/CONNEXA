// Fills the Study Room book covers.
// Reads the titles already seeded in supabase/seed_study_books.sql and looks
// each one up — Open Library first, because its jacket scans are the best
// pictures, then the Internet Archive, which holds the scanned copy of almost
// every Project Gutenberg title that Open Library has no cover for. Writes
// supabase/seed_book_covers.sql (a single UPDATE ... FROM VALUES statement) for
// the Supabase dashboard.
//
//   node scripts/fetch-book-covers.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SEED = path.join(ROOT, "supabase", "seed_study_books.sql");
const OUT = path.join(ROOT, "supabase", "seed_book_covers.sql");

const HOLY = [
  { id: "0a1e2b01-0000-4000-8000-000000000001", title: "The Holy Bible", author: "" },
  { id: "0a1e2b01-0000-4000-8000-000000000002", title: "The Holy Quran", author: "" },
];

// ('uuid','category','Title','Author, First','https://…',NULL),
const ROW = /\('([0-9a-f-]{36})','[a-z]+','((?:[^']|'')*)'(?:,'((?:[^']|'')*)')?,'(https?:[^']*)',/g;

function unquote(text) {
  return text.replace(/''/g, "'");
}

function parseRows() {
  const sql = fs.readFileSync(SEED, "utf8");
  const books = [];
  for (const m of sql.matchAll(ROW)) {
    books.push({ id: m[1], title: unquote(m[2]), author: unquote(m[3] || "") });
  }
  return books.concat(HOLY);
}

// Open Library answers the less popular titles slowly — the odd lookup takes
// over half a minute — so the timeout is generous and a failed lookup is
// retried rather than counted as "no cover".
async function json(url, tries = 4) {
  let lastError = "";
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(75000), headers: { "user-agent": "CONNEXA study room" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return { data: await res.json(), error: null };
    } catch (e) {
      lastError = e.name + ": " + e.message;
      if (i === tries - 1) return { data: null, error: lastError };
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return { data: null, error: lastError };
}

// Open Library matches on whole words, so a seeded title like
// "Pride and Prejudice and Zombies : A Novel" finds nothing. Strip the noise
// and try again with just the main title and the author's surname.
function simplified(book) {
  const main = book.title.split(":")[0].replace(/\(.*?\)/g, "").replace(/[,.;]+/g, "");
  return main.replace(/^(the|a|an)\s+/i, "").trim();
}

async function lookup(title, author) {
  const params = new URLSearchParams({
    title,
    limit: "8",
    fields: "title,author_name,cover_i",
  });
  if (author) params.set("author", author);
  const { data, error } = await json("https://openlibrary.org/search.json?" + params.toString());
  if (data === null) {
    lookupFailures++;
    lastError = error;
    return null;
  }
  const docs = (data && data.docs) || [];
  const withCover = docs.find((d) => d.cover_i);
  if (!withCover) return null;
  return `https://covers.openlibrary.org/b/id/${withCover.cover_i}-M.jpg`;
}

let lookupFailures = 0;
let lastError = "";

// Seeded titles carry catalogue noise — MARC subfield codes like "$b", bracketed
// additions, long subtitles — that neither search engine matches on.
function cleanTitle(title) {
  return title
    .replace(/\$[a-z]\s?/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .split(/[:;]/)[0]
    .replace(/[,.\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The archive's image service answers with the scanned cover, or a stub page
// when a item has none — anything under two kilobytes is that stub.
async function archiveCover(book) {
  const title = cleanTitle(book.title);
  if (title.length < 4) return null;
  const params = new URLSearchParams({
    q: `title:(${title}) AND mediatype:(texts)`,
    rows: "5",
    page: "1",
    output: "json",
  });
  params.append("fl[]", "identifier");
  const { data } = await json("https://archive.org/advancedsearch.php?" + params.toString());
  if (data === null) {
    lookupFailures++;
    return null;
  }
  const ids = ((data.response && data.response.docs) || []).map((d) => d.identifier).filter(Boolean).slice(0, 3);
  for (const id of ids) {
    const url = `https://archive.org/services/img/${id}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { "user-agent": "CONNEXA study room" } });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 2000) continue;
      return url;
    } catch {
      // this candidate is unreachable — the next one may not be
    }
  }
  return null;
}

async function coverFor(book) {
  const author = book.author.split(",")[0].trim();
  return (
    (await lookup(book.title, author)) ||
    (await lookup(simplified(book), author.split(" ")[0])) ||
    (await lookup(simplified(book), "")) ||
    (await archiveCover(book))
  );
}

async function pool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await worker(items[i], i);
        done++;
        if (done % 25 === 0) console.log("looked up " + done + "/" + items.length);
      }
    })
  );
  return results;
}

const books = parseRows();

// Keep covers already found on a previous run, and only spend requests on the
// titles that are still blank.
const existing = new Map();
if (fs.existsSync(OUT)) {
  for (const m of fs.readFileSync(OUT, "utf8").matchAll(/\('([0-9a-f-]{36})'::uuid, '(https:[^']+)'\)/g)) {
    existing.set(m[1], m[2]);
  }
}
// LIMIT=8 tries the first eight blanks only — used when checking connectivity.
const todo = books.filter((b) => !existing.has(b.id)).slice(0, Number(process.env.LIMIT) || Infinity);
console.log(`books: ${books.length} total, ${existing.size} already covered, ${todo.length} to look up`);

const failNotes = [];
const found = await pool(todo, 6, async (b) => {
  const before = lookupFailures;
  lastError = "";
  const url = await coverFor(b);
  if (!url) {
    failNotes.push(`${b.title.slice(0, 44)} — ${lookupFailures > before ? "lookups unanswered (" + lastError + ")" : "answered, no cover in the results"}`);
  }
  return { ...b, url };
});
console.log(failNotes.slice(0, 8).join("\n"));

const fresh = new Map(found.filter((f) => f.url).map((f) => [f.id, f.url]));
const withCover = books
  .map((b) => ({ id: b.id, url: existing.get(b.id) || fresh.get(b.id) || null }))
  .filter((f) => f.url);
console.log(`covers now held by ${withCover.length} of ${books.length} books`);
if (lookupFailures > 0) {
  console.log(`${lookupFailures} lookups never answered and will be retried on the next run`);
}

const VALUES = withCover
  .map((f) => `  ('${f.id}'::uuid, '${f.url}')`)
  .join(",\n");

fs.writeFileSync(
  OUT,
  `-- Study Room book covers.
--
-- Generated by scripts/fetch-book-covers.mjs from title lookups against the
-- Open Library search API, with the Internet Archive as the fallback for the
-- titles Open Library has no jacket for. Both services allow linking to their
-- images. Safe to re-run.
--
-- ${withCover.length} of ${books.length} seeded titles have a cover.

BEGIN;

UPDATE public.study_books AS b
SET cover_url = v.url
FROM (
VALUES
${VALUES}
) AS v(id, url)
WHERE b.id = v.id;

-- The room now shows archive.org jackets too, so the Credits page names them.
UPDATE public.site_content
SET body = REPLACE(body,
  '• Learning shortcuts link out to',
  '• Internet Archive (archive.org and archive.org/services/img) — the scanned
  covers for titles Open Library has no jacket for.
• Learning shortcuts link out to')
WHERE key = 'credits' AND body NOT LIKE '%Internet Archive%';

COMMIT;

SELECT category, COUNT(*) AS with_cover
FROM public.study_books
WHERE cover_url IS NOT NULL
GROUP BY category
ORDER BY category;
`
);

console.log("wrote " + path.relative(ROOT, OUT));
