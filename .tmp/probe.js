const fs = require("fs");
const { execFileSync } = require("child_process");
const rows = JSON.parse(fs.readFileSync(".tmp/books.json", "utf8"));

const byCat = {};
for (const r of rows) (byCat[r.cat] = byCat[r.cat] || []).push(r);

const picked = [];
const seen = new Set();
function add(r) {
  if (!r || !r.gid || seen.has(r.gid)) return;
  seen.add(r.gid);
  picked.push(r);
}
for (const cat of Object.keys(byCat)) {
  const list = byCat[cat];
  const pdfs = list.filter((r) => r.url.indexOf("-pdf.pdf") >= 0);
  const ebooks = list.filter((r) => r.url.indexOf("-pdf.pdf") < 0);
  add(ebooks[0]); add(ebooks[Math.floor(ebooks.length / 2)]); add(ebooks[ebooks.length - 1]);
  add(pdfs[0]); add(pdfs[pdfs.length - 1]);
}
// Titles named in the brief / prior investigation.
for (const gid of ["9253", "10253", "1342", "84", "11"]) {
  add(rows.find((r) => r.gid === gid) || { gid, cat: "(extra)", title: "(not in seed)", url: "https://www.gutenberg.org/ebooks/" + gid });
}

const formats = [
  ["txt", (id) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`],
  ["txt.utf8", (id) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt.utf-8`],
  ["files-0", (id) => `https://www.gutenberg.org/files/${id}/${id}-0.txt`],
  ["html", (id) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.html`],
  ["html-images", (id) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.html`],
  ["epub.img", (id) => `https://www.gutenberg.org/ebooks/${id}.epub.images`],
  ["epub.noimg", (id) => `https://www.gutenberg.org/ebooks/${id}.epub.noimages`],
];

const out = [];
out.push("id\tcategory\ttitle\t" + formats.map((f) => f[0]).join("\t"));
for (const r of picked) {
  const cells = [];
  for (const [, fn] of formats) {
    const url = fn(r.gid);
    let res;
    try {
      res = execFileSync("curl", ["-sS", "--ssl-no-revoke", "-o", "/dev/null", "-w", "%{http_code}:%{size_download}", "--max-time", "25", url], { encoding: "utf8", timeout: 40000 }).trim();
    } catch (e) {
      res = "ERR:" + String(e.message).slice(0, 60).replace(/\s+/g, " ");
    }
    cells.push(res);
    fs.appendFileSync(".tmp/probe-raw.txt", `${r.gid}\t${url}\t${res}\n`);
  }
  const line = `${r.gid}\t${r.cat}\t${r.title.slice(0, 40)}\t${cells.join("\t")}`;
  out.push(line);
  console.log(line);
  fs.writeFileSync(".tmp/probe.txt", out.join("\n") + "\n");
}
console.log("DONE", picked.length, "books");