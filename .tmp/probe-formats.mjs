// Scratch 2: how do we learn a book's formats reliably?
// (a) scrape the catalogue page's Formats section, (b) RDF, (c) gutendex JSON.
const IDS = (process.argv[2] || "38769,33283,17384,10253,84,54300,67017,69512").split(",");
const UA = { "user-agent": "CONNEXA study room research" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function full(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(40000), headers: UA });
    const text = await res.text();
    return { url, status: res.status, type: res.headers.get("content-type"), finalUrl: res.url, ms: Date.now() - t0, text };
  } catch (e) {
    return { url, status: "ERR " + (e.name || "?") + " " + (e.cause?.name || "") + " " + (e.message || "").slice(0, 80), ms: Date.now() - t0, text: "" };
  }
}

const out = [];
for (const id of IDS) {
  const cat = await full(`https://www.gutenberg.org/ebooks/${id}`);
  // The catalogue page lists every format the item offers.
  const fmtIdx = cat.text.search(/Formats/i);
  const slice = fmtIdx >= 0 ? cat.text.slice(fmtIdx, fmtIdx + 6000) : "";
  const links = [...slice.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const titleTag = (cat.text.match(/<title>([^<]*)<\/title>/i) || [])[1] || "";
  const is404 = /Page Not Found|404/i.test(titleTag + cat.text.slice(0, 400));
  const rdf = await full(`https://www.gutenberg.org/ebooks/${id}.rdf`);
  const rdfFmt = [...rdf.text.matchAll(/(?:pgterms:file|Ebook>)[\s\S]{0,400}?<dcterms:format>[\s\S]{0,200}?http:\/\/www\.gutenberg\.org[^<"]+/g)].map((m) => m[0]);
  const rdfLinks = [...rdf.text.matchAll(/http:\/\/www\.gutenberg\.org\/[^<"']+/g)].map((m) => m[0]).slice(0, 20);
  const gx = await full(`https://gutendex.com/books/${id}`);
  let gxKeys = null, gxText = null;
  try {
    const j = JSON.parse(gx.text);
    gxKeys = Object.keys(j.formats || {});
    gxText = j.formats["text/plain; charset=utf-8"] || null;
  } catch {}
  out.push({
    id, catStatus: cat.status, catMs: cat.ms, titleTag: titleTag.slice(0, 70), is404,
    formats: links, rdfStatus: rdf.status, rdfMs: rdf.ms, rdfLinks, gxStatus: gx.status, gxMs: gx.ms, gxKeys, gxText,
  });
  await sleep(700);
}
console.log(JSON.stringify(out, null, 1));
