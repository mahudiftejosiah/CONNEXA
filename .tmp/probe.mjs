// Four embed slugs have no storefront page any more, so their og:image came
// from a topic page and names a different game. Try the shapes that still
// describe the exact game being embedded.
import fs from "node:fs";

const ids = ["basketball-stars", "3d-free-kick", "parkour-block-3d", "traffic-run"];
const UA = { headers: { "User-Agent": "Mozilla/5.0" } };

const og = (h) => {
  const m = h.match(/property="og:image"\s+content="([^"]+)"/);
  return m ? m[1].replace(/&amp;/g, "&") : null;
};
const title = (h) => (h.match(/<title>([^<]*)<\/title>/) || [])[1] || "";

for (const id of ids) {
  console.log("== " + id);
  for (const u of [
    `https://www.crazygames.com/embed/${id}`,
    `https://backend.crazygames.com/api/game/${id}`,
    `https://backend.crazygames.com/api/game/${id}?language=en`,
    `https://games.crazygames.com/en_US/${id}/config.json`,
  ]) {
    try {
      const r = await fetch(u, UA);
      const t = await r.text();
      console.log(`   ${r.status} ${u}`);
      if (r.ok && t.length < 400_000) {
        if (t.trimStart().startsWith("{")) {
          const img = t.match(/https:[^"]*imgs\.crazygames\.com[^"]{0,120}/g);
          console.log("      json imgs:", img ? JSON.stringify([...new Set(img)].slice(0, 3)) : "none");
        } else {
          console.log("      title:", title(t).slice(0, 70), "| og:", og(t));
        }
      }
    } catch (e) { console.log("   ERR", u, e.message); }
  }
}
console.log("PROBE3:0");
