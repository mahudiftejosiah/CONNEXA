// Pulls the official per-game cover image out of each CrazyGames page so our
// 3D thumbnails genuinely show the game they open.
import fs from "node:fs";

const ids = ["drift-hunters","pixel-gun-3d","basketball-stars","soccer-random","snow-rider-3d","madalin-stunt-cars-2","madalin-cars-multiplayer","3d-car-simulator","highway-racer","highway-racer-2","real-simulator-monster-truck","car-crash-simulator-royale","gas-monsters","super-hot","sniper-clash-3d","zombie-outbreak-arena","zombie-world","rocket-bot-royale","boxing-random","3d-free-kick","parkour-block-3d","traffic-run","paper-minecraft","block-tech-epic-sandbox","pool-club","3d-bowling","stickman-fighting-3d","crazy-roll-3d","ships-3d","marble-run"];

const UA = { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } };

function ogImage(html) {
  const m = html.match(/property="og:image"\s+content="([^"]+)"/);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

function resize(url, w, h) {
  const base = url.split("?")[0];
  return `${base}?metadata=none&quality=80&width=${w}&height=${h}&fit=crop&resizer=covers`;
}

const out = {};
for (const id of ids) {
  let found = null;
  for (const path of [`https://www.crazygames.com/game/${id}`, `https://www.crazygames.com/embed/${id}`]) {
    try {
      const res = await fetch(path, UA);
      if (!res.ok) continue;
      const img = ogImage(await res.text());
      if (img && img.startsWith("https://imgs.crazygames.com/")) { found = img; break; }
    } catch (e) { /* try the next shape */ }
  }
  if (!found) { out[id] = null; console.log(`MISS ${id}`); continue; }
  const thumb = resize(found, 600, 338);
  const big = resize(found, 1200, 675);
  try {
    const head = await fetch(thumb, { ...UA, method: "HEAD" });
    console.log(`${head.status} ${id} ${thumb}`);
    out[id] = head.ok ? { thumb, big } : null;
  } catch (e) {
    console.log(`ERR ${id} ${e.message}`);
    out[id] = null;
  }
}

fs.writeFileSync(".tmp/covers.json", JSON.stringify(out, null, 1));
console.log("COVERS_DONE " + Object.values(out).filter(Boolean).length + "/" + ids.length);
