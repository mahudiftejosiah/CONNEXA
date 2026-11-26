const fs = require("fs");
const lines = fs.readFileSync("supabase/seed_study_books.sql", "utf8").split("\n");
const rows = [];
for (const line of lines) {
  const t = line.trim();
  if (!t.startsWith("('")) continue;
  const body = t.replace(/^\(/, "").replace(/\),?$/, "");
  const parts = body.split("','");
  if (parts.length < 5) { console.log("SKIP", t.slice(0, 60)); continue; }
  const id = parts[0].replace(/^'/, "");
  const cat = parts[1];
  const title = parts[2].replace(/''/g, "'");
  const author = parts[3].replace(/''/g, "'");
  const url = parts[4].replace(/'$/, "");
  const gid = (url.match(/gutenberg\.org\/(?:ebooks\/(\d+)|files\/(\d+)\/)/) || [])[1] || (url.match(/files\/(\d+)\//) || [])[1];
  rows.push({ id, cat, title, author, url, gid });
}
console.log("parsed rows", rows.length);
const by = {};
for (const r of rows) (by[r.cat] = by[r.cat] || []).push(r);
for (const k of Object.keys(by)) {
  console.log("==", k, by[k].length);
  for (const r of by[k].slice(0, 3)) console.log("   ", r.gid, r.title.slice(0, 55));
}
console.log("--- pdf-url titles (28):");
for (const r of rows.filter((r) => r.url.indexOf("-pdf.pdf") >= 0)) console.log(r.gid, r.cat, r.title.slice(0, 45));
fs.writeFileSync(".tmp/books.json", JSON.stringify(rows));