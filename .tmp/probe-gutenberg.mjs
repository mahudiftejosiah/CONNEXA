// Scratch: probe Project Gutenberg URL schemes for a sample of seeded books.
// Reads at most a few KB per URL so we never download whole books.
const IDS = process.argv[2]?.split(",") || [
  "84", "1342", "1661", "2701",          // low classic ids (not seeded)
  "359", "1145",                          // seeded low ids
  "38769", "33283", "17384", "36154", "57355", // files/<id>/<id>-pdf.pdf shaped seeds
  "10253",                                // memory: no plain text
  "60619", "52038", "67017", "69512", "54300", "37461", // ebooks-shaped seeds, incl. >60000
];
const UA = { "user-agent": "CONNEXA study room research" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET but only keep the first `cap` bytes, then cancel the body stream.
async function probe(url, cap = 4000) {
  const out = { url, status: "-", type: "-", len: "-", finalUrl: "-", bytes: 0, head: "" };
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000), headers: UA });
    out.status = res.status;
    out.type = res.headers.get("content-type") || "-";
    out.len = res.headers.get("content-length") || "-";
    out.finalUrl = res.url;
    let got = "";
    if (res.body) {
      const reader = res.body.getReader();
      let done = false;
      while (!done && got.length < cap) {
        const { value, done: d } = await reader.read();
        if (d) break;
        got += new TextDecoder().decode(value);
        if (got.length >= cap) { await reader.cancel(); done = true; break; }
      }
    }
    out.bytes = got.length;
    out.head = got.slice(0, 700).replace(/\s+/g, " ");
  } catch (e) {
    out.status = "ERR " + e.name;
    out.head = String(e.message).slice(0, 120);
  }
  return out;
}

function verdict(p) {
  const t = p.head.toLowerCase();
  const isHtml = /text\/html/.test(p.type);
  const isText = /text\/plain/.test(p.type);
  if (p.status !== 200) return `${p.status}`;
  if (isHtml && /page not found|404|has been moved|error/.test(t.slice(0, 400))) return "200?html-error?";
  if (isHtml) return `200 html(${p.bytes}b read)`;
  if (isText) return `200 text(${p.len}b)`;
  return `200 ${p.type.split(";")[0]}`;
}

const rows = [];
for (const id of IDS) {
  const urls = [
    ["catalog", `https://www.gutenberg.org/ebooks/${id}`],
    ["cache-txt", `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`],
    ["cache-utf8", `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt.utf-8`],
    ["ebook-txt.utf8", `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`],
    ["ebook-txt", `https://www.gutenberg.org/ebooks/${id}.txt`],
    ["ebook-html.utf8", `https://www.gutenberg.org/ebooks/${id}.html.utf-8`],
    ["files-h", `https://www.gutenberg.org/files/${id}/${id}-h/${id}-h.htm`],
  ];
  const rec = { id };
  for (const [k, u] of urls) {
    const p = await probe(u, k === "catalog" ? 60000 : 3000);
    rec[k] = { status: p.status, type: p.type, len: p.len, finalUrl: p.finalUrl, v: verdict(p) };
    if (k === "catalog") {
      const hrefs = [...p.head.matchAll(/href="(\/ebooks\/[^"]+|\/cache\/[^"]+|\/files\/[^"]+)"/g)].map((m) => m[1]);
      rec.catalogFormats = hrefs.slice(0, 30);
      rec.catalogLooksError = /Page not found|404|Reference Error|no such item/i.test(p.head);
      rec.catalogTitle = (p.head.match(/<title>([^<]*)</) || [])[1] || "";
    }
    await sleep(450);
  }
  rows.push(rec);
  console.error("probed", id);
}
console.log(JSON.stringify(rows, null, 1));
