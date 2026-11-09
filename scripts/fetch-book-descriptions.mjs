// Fills the Study Room book descriptions.
// Reads the titles already seeded in supabase/seed_study_books.sql and asks the
// Wikipedia API for the opening paragraph of each one's article, preferring the
// page whose title actually matches the book. Writes
// supabase/seed_book_descriptions.sql (one UPDATE ... FROM VALUES statement)
// for the Supabase dashboard.
//
//   node scripts/fetch-book-descriptions.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SEED = path.join(ROOT, "supabase", "seed_study_books.sql");
const OUT = path.join(ROOT, "supabase", "seed_book_descriptions.sql");

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

async function json(url, tries = 3) {
  let lastError = "";
  for (const i of [0, 1, 2].slice(0, tries)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { "user-agent": "CONNEXA study room" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return { data: await res.json(), error: null };
    } catch (e) {
      lastError = e.name + ": " + e.message;
      if (i === tries - 1) return { data: null, error: lastError };
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  return { data: null, error: lastError };
}

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

function simplified(book) {
  const main = book.title.split(":")[0].replace(/\(.*?\)/g, "").replace(/[,.;]+/g, "");
  return main.replace(/^(the|a|an)\s+/i, "").trim();
}

// A Wikipedia lead opens with pronunciation glosses and carries "[1]" footnote
// markers. Keep the prose, drop the apparatus.
function plain(extract) {
  if (!extract) return "";
  return extract
    .replace(/\(\s*[^)]{0,90};[^)]{0,90}\)/g, " ")
    .replace(/\(\s*(?:US|UK|Brit|BRIT|Amer|AMER|IPA|audio|help)\b[^)]*\)/gi, " ")
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tidy(text) {
  const flat = text.replace(/^\s*(from the cover|from the jacket|provided by:?|description:?)\s*/i, "").trim();
  if (flat.length < 60) return "";
  if (flat.length <= 480) return flat;
  const cut = flat.slice(0, 480);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (stop > 200 ? cut.slice(0, stop + 1) : cut.replace(/\s\S*$/, "") + "…").trim();
}

function normalise(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\((?:disambiguation|novel|book|poem|play|short story|collection)\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/^(the|a|an)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 3 = the article is about this book; 2 = one name contains the other;
// 1 = two substantial words agree; 0 = something else wears the same title.
function scoreTitle(want, got) {
  const a = normalise(cleanTitle(want));
  const b = normalise(got);
  if (!a || !b) return 0;
  if (a === b) return 3;
  if (b.startsWith(a) || a.startsWith(b)) return 2;
  const words = new Set(b.split(" "));
  const shared = a.split(" ").filter((w) => w.length > 3 && words.has(w)).length;
  return shared >= 2 ? 1 : 0;
}

const WIKI = "https://en.wikipedia.org/w/api.php";

async function pagesFor(query) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "8",
    gsrnamespace: "0",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    // MediaWiki hands back one extract per request unless told otherwise, which
    // silently throws away every search result but the top hit.
    exlimit: "20",
    redirects: "1",
  });
  const { data } = await json(WIKI + "?" + params.toString());
  const pages = data && data.query && data.query.pages;
  if (!pages) return [];
  return Object.values(pages)
    .sort((x, y) => (x.index ?? 99) - (y.index ?? 99))
    .map((p) => ({ title: p.title, text: tidy(plain(p.extract || "")) }));
}

// An article titled the same as the book is not always *about* the book —
// "History of mathematics" is a topic, "William Oughtred" a person. The lead of
// a book article names the author, so that is what settles it.
const BOOK_WORDS = /\b(novel|book|textbook|treatise|essay|poem|play|written by|published|authored)\b/i;

function rankMatch(book, pageTitle, text) {
  const s = scoreTitle(book.title, pageTitle);
  // An article named for exactly this book is about this book, glossed or not.
  if (s === 3) return 4;
  if (s < 2) return 0;
  const sure = (book.author.split(",")[0] || "").trim().split(/\s+/)[0] || "";
  if (sure.length > 2 && text.toLowerCase().includes(sure.toLowerCase())) return s + 1;
  return BOOK_WORDS.test(text) ? s : 0;
}

async function descriptionFor(book) {
  const author = book.author.split(",")[0].trim();
  const main = simplified(book);
  if (main.length < 3) return "";
  const queries = author && author.length > 2 ? [main + " " + author, main] : [main];
  let best = 0;
  let bestText = "";
  for (const q of queries) {
    for (const page of await pagesFor(q)) {
      if (!page.text) continue;
      const rank = rankMatch(book, page.title, page.text);
      if (rank > best) {
        best = rank;
        bestText = page.text;
      }
    }
    if (best >= 4) break;
  }
  return bestText;
}

function sqlQuote(text) {
  return "'" + text.replace(/'/g, "''") + "'";
}

// Most of these are centuries-old Gutenberg titles Wikipedia has no article
// for, but their own subtitles say what they are ("Being the Original
// Researches of…", "Notes, Recreations, Essays"), so the shelf card can still
// describe them instead of going blank.
function personFrom(author) {
  const comma = author.indexOf(",");
  if (comma < 0) return author.trim();
  const last = author.slice(0, comma).trim();
  const rest = author.slice(comma + 1).replace(/\((?:[^)]*)\)/g, " ").replace(/\s+/g, " ").trim();
  return rest ? `${rest} ${last}` : last;
}

function subtitleOf(title) {
  const sub = title.split(/[:;]/).slice(1).join(":").replace(/\s+/g, " ").trim();
  return sub.length >= 16 ? sub : "";
}

function fallbackFor(book) {
  const sub = subtitleOf(book.title);
  const who = personFrom(book.author);
  if (sub && who) return `${sub} — by ${who}. A free classic from Project Gutenberg.`;
  if (sub) return `${sub}. A free classic from Project Gutenberg.`;
  if (who) return `By ${who}, digitised free by Project Gutenberg. Open it and the Study Room keeps your place.`;
  return "";
}

const books = parseRows();
const limit = Number(process.env.LIMIT || 0);
const skip = Number(process.env.SKIP || 0);
const todo = books.slice(skip, limit > 0 ? skip + limit : undefined);
if (limit > 0 || skip > 0) console.log(`sampling ${todo.length} titles from index ${skip}`);
console.log(`reading ${books.length} seeded titles`);

// Four titles in flight: enough to finish a shelf in a reasonable time, few
// enough that Wikipedia never has to think about who is asking.
const found = [];
let n = 0;
let next = 0;
async function worker() {
  for (;;) {
    const i = next++;
    if (i >= todo.length) return;
    const book = todo[i];
    let text = "";
    let source = "title page";
    try {
      text = await descriptionFor(book);
      if (text) source = "wikipedia";
    } catch {}
    if (!text) text = fallbackFor(book);
    n++;
    if (text) found.push({ id: book.id, text, source });
    if (n % 20 === 0) console.log(`  ${n}/${todo.length} — ${found.length} with a description`);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
console.log(`  ${n}/${todo.length} — ${found.length} with a description`);

function statement(rows, note) {
  if (rows.length === 0) return "";
  const lines = rows.map((f) => `  (${f.id}::uuid, ${sqlQuote(f.text)})`);
  return `-- ${note}\nUPDATE public.study_books AS b\nSET description = v.text\nFROM (\nVALUES\n${lines.join(",\n")}\n) AS v(id, text)\nWHERE b.id = v.id;\n\n`;
}

const wiki = found.filter((f) => f.source === "wikipedia");
const typed = found.filter((f) => f.source !== "wikipedia");

const header = `-- Study Room book descriptions: what the shelf card says about a book.
--
-- Generated by scripts/fetch-book-descriptions.mjs, which reads the titles
-- already seeded in supabase/seed_study_books.sql. Safe to re-run; it only ever
-- writes the description column.
--
-- Two kinds of blurb, kept in separate statements so their provenance is clear:
--   ${wiki.length} from the opening paragraph of the title's Wikipedia article. That
--      text is Wikipedia's, shared under CC BY-SA 4.0, and the room says so on
--      the card.
--   ${typed.length} from the book's own title page — its subtitle and author — for the
--      centuries-old Gutenberg titles no encyclopaedia has an article about.
--   ${books.length - found.length} of ${books.length} seeded titles get neither and keep a NULL, so the card
--      falls back to the shelf they stand on and the promise to save your place.

BEGIN;

`;

const footer = `COMMIT;

SELECT count(*) AS books, count(description) AS with_description FROM public.study_books;
`;

fs.writeFileSync(OUT, header + statement(wiki, "Wikipedia summaries (CC BY-SA 4.0).") + statement(typed, "From the book's own subtitle and author line.") + footer, "utf8");
console.log(`wrote ${found.length} descriptions (${wiki.length} from Wikipedia) to ${path.relative(ROOT, OUT)}`);
