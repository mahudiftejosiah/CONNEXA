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
for (const gid of ["9253", "10253", "1342", "84", "11"]) {
  add(rows.find((r) => r.gid === gid) || { gid, cat: "(extra)", title: "(not in seed)", url: "https://www.gutenberg.org/ebooks/" + gid });
}

const formats = [
  ["txt", (id) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`],
  ["txt.utf8", (id) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt.utf-8`],
  ["files-0", (id) => `https://www.gutenberg.org/files/${id}/${id}-0.txt`],
  ["html", (id) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.html`],
  ["html-img", (id) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.html`],
  ["epub.img", (id) => `https://www.gutenberg.org/ebooks/${id}.epub.images`],
  ["epub.noimg", (id) => `https://www.gutenberg.org/ebooks/${id}.epub.noimages`],
];

function probe(url) {
  try {
    const s = execFileSync("curl", [
      "-sS", "--ssl-no-revoke", "-L", "--max-time", "25",
      "-o", ".tmp/dl.bin", "-w", "%{http_code}:%{size_download}", url,
    ], { encoding: "utf8", timeout: 40000, stdio: ["ignore", "pipe", "pipe"] });
    return s.trim();
  } catch (e) {
    const err = String((e && (e.stderr || e.stdout)) || (e && e.message) || "?").replace(/\s+/g, " ").trim();
    return "ERR " + err.slice(0, 110);
  }
}

const out = ["id\tcategory\ttitle\t" + formats.map((f) => f[0]).join("\t")];
fs.writeFileSync(".tmp/probe2-raw.txt", "");
for (const r of picked) {
  const cells = [];
  for (const [, fn] of formats) {
    const url = fn(r.gid);
    const res = probe(url);
    cells.push(res);
    fs.appendFileSync(".tmp/probe2-raw.txt", `${r.gid}\t${url}\t${res}\n`);
  }
  const line = `${r.gid}\t${r.cat}\t${r.title.slice(0, 38)}\t${cells.join("\t")}`;
  out.push(line);
  console.log(line);
  fs.writeFileSync(".tmp/probe2.txt", out.join("\n") + "\n");
}
console.log("DONE", picked.length, "books");