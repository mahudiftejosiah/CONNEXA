// Scratch: parse the seeded study_books rows and report the URL shapes + the
// gutenberg ids the app would build text URLs for.
import fs from "node:fs";

const files = [
  "supabase/seed_study_books.sql",
  "supabase/migrations/013_study_sites_games_upgrade.sql",
];
const ROW = /\('([0-9a-f-]{36})','([a-z]+)','((?:[^']|'')*)'(?:,'((?:[^']|'')*)')?,'(https?:[^']*)',/g;
const GUT = /gutenberg\.org\/(?:ebooks\/(\d+)|files\/(\d+)\/)/; // copied from src/lib/gutenberg.ts

const books = [];
for (const f of files) {
  const sql = fs.readFileSync(f, "utf8");
  for (const m of sql.matchAll(ROW)) {
    books.push({
      file: f,
      uuid: m[1],
      category: m[2],
      title: m[3].replace(/''/g, "'"),
      author: (m[4] || "").replace(/''/g, "'"),
      url: m[5],
    });
  }
}
const shapes = {};
const idMap = new Map();
const unmatched = [];
for (const b of books) {
  const m = GUT.exec(b.url);
  if (!m) {
    unmatched.push(b);
    continue;
  }
  const gid = m[1] || m[2];
  b.gid = gid;
  idMap.set(gid, b);
  const shape = b.url.includes("/ebooks/") ? "ebooks" : "files-pdf";
  shapes[shape] = (shapes[shape] || 0) + 1;
}
console.log("total parsed rows:", books.length);
console.log("url shapes:", JSON.stringify(shapes));
console.log("no gutenberg id:", unmatched.map((u) => `${u.uuid} ${u.title} ${u.url}`));
const ids = [...idMap.keys()].map(Number).sort((a, b) => a - b);
console.log("id range:", ids[0], "->", ids.at(-1));
console.log("ids <= 3000:", ids.filter((i) => i <= 3000).join(","));
console.log("ids > 60000 count:", ids.filter((i) => i > 60000).length);
console.log("files-pdf-shaped ids:", books.filter((b) => b.url.includes("/files/")).map((b) => b.gid).join(","));
console.log("dup gutenberg ids:", books.length - idMap.size);
fs.writeFileSync(".tmp/gb-books.json", JSON.stringify(books, null, 1));
// a spread of samples for probing
const pick = ["84", "1342", "1661", "2701", "10253", "38769", "33283", "17384", "36154", "57355", "60619", "52038", "67017", "69512", "54300", "37461"];
for (const p of pick) {
  const b = idMap.get(p);
  console.log("SAMPLE", p, b ? `${b.uuid} | ${b.category} | ${b.title.slice(0, 48)} | ${b.url}` : "NOT IN SEED");
}
