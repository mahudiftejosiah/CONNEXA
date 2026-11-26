import fs from "node:fs";

// CrazyGames retired the storefront pages for four of our embed slugs, so their
// og:image now describes a different game. Dig the real entry out of the topic
// page's own JSON instead.
const wanted = {
  "basketball-stars": "Basketball Stars",
  "3d-free-kick": "3D Free Kick",
  "parkour-block-3d": "Parkour Block 3D",
  "traffic-run": "Traffic Run",
};

const topic = {
  "basketball-stars": "https://www.crazygames.com/t/basketball",
  "3d-free-kick": "https://www.crazygames.com/t/soccer",
  "parkour-block-3d": "https://www.crazygames.com/t/parkour",
  "traffic-run": "https://www.crazygames.com/t/car",
};

for (const [slug, title] of Object.entries(wanted)) {
  const html = await (await fetch(topic[slug], { headers: { "User-Agent": "Mozilla/5.0" } })).text();
  const hits = [];
  const re = /"slug":"([a-z0-9-]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const start = html.lastIndexOf("{", m.index);
    const body = html.slice(start, start + 900);
    if (new RegExp(`"slug":"${m[1]}"`).test(body) && /imgs\.crazygames\.com/.test(body)) {
      const img = body.match(/https:[^"]*imgs\.crazygames\.com[^"]*/);
      const name = body.match(/"title":"([^"]*)"/) || body.match(/"name":"([^"]*)"/);
      hits.push([m[1], name ? name[1] : "?", img ? img[0].replace(/\\u002F/g, "/") : "?"]);
    }
  }
  console.log("== " + slug + " (" + title + ")");
  for (const h of hits.slice(0, 6)) console.log("   " + h.join("  |  "));
}
console.log("TOPIC_DUMP:0");
