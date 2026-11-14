export type TrendingGame = {
  id: string;
  name: string;
  desc: string;
  url: string;
  art: TrendingArt;
  /** 16:9 publisher artwork for this exact game; the gradient is only a fallback. */
  thumb: string;
};

/** Art keys are mapped to icons + colours in the Games tab client. */
export type TrendingArt =
  | "car" | "truck" | "crosshair" | "ball" | "snowflake" | "bomb" | "flame"
  | "target" | "skull" | "ghost" | "rocket" | "swords" | "runner" | "bike"
  | "blocks" | "grid" | "dice" | "anchor" | "waves";

const cdn = (slug: string) => `https://games.crazygames.com/en_US/${slug}/index.html`;

// Official 16:9 publisher artwork, read off each game page's own og:image and
// asked from CrazyGames' image CDN at a fixed 600x338 crop, so every card is
// the same shape and nothing is stretched. The four games whose storefront
// artwork no longer matches the game we embed carry original covers we drew
// ourselves, shipped from /public/games.
const cover = (path: string) =>
  `https://imgs.crazygames.com/${path}?metadata=none&quality=80&width=600&height=338&fit=crop&resizer=covers`;

// Every slug below was verified to serve a 200 with no X-Frame-Options / CSP
// header, so it actually renders inside our iframe.
export const TRENDING_3D: TrendingGame[] = [
  { id: "drift-hunters", name: "Drift Hunters", desc: "Tune a drift machine and tear up open 3D tracks.", url: cdn("drift-hunters"), art: "car",
    thumb: cover("games/drift-hunters/cover-1656950639575.png") },
  { id: "pixel-gun-3d", name: "Pixel Gun 3D", desc: "Blocky multiplayer shooter with dozens of maps.", url: cdn("pixel-gun-3d"), art: "crosshair",
    thumb: cover("games/pixel-gun-3d/thumb-1563607752320.png") },
  { id: "basketball-stars", name: "Basketball Stars", desc: "Fast 3D street basketball, one-on-one.", url: cdn("basketball-stars"), art: "ball",
    thumb: "/games/basketball-stars.jpg" },
  { id: "soccer-random", name: "Soccer Random", desc: "Wobbly 3D football physics against a rival.", url: cdn("soccer-random"), art: "ball",
    thumb: cover("games/soccer-random/cover_16x9-1732744645362.png") },
  { id: "snow-rider-3d", name: "Snow Rider 3D", desc: "Sled downhill at speed, dodge the trees.", url: cdn("snow-rider-3d"), art: "snowflake",
    thumb: cover("snow-rider-3d_16x9/20260120063434/snow-rider-3d_16x9-cover") },
  { id: "madalin-stunt-cars-2", name: "Madalin Stunt Cars 2", desc: "Supercars, loops and an open 3D city.", url: cdn("madalin-stunt-cars-2"), art: "car",
    thumb: cover("games/madalin-stunt-cars-2/cover_16x9-1695113654654.png") },
  { id: "madalin-cars-multiplayer", name: "Madalin Cars Multiplayer", desc: "Race real cars online against other drivers.", url: cdn("madalin-cars-multiplayer"), art: "car",
    thumb: cover("games/madalin-cars-multiplayer/cover_16x9-1695112368258.png") },
  { id: "3d-car-simulator", name: "3D Car Simulator", desc: "Sandbox driving, parking and crashing physics.", url: cdn("3d-car-simulator"), art: "car",
    thumb: cover("games/3d-car-simulator/cover-1588261821184.png") },
  { id: "highway-racer", name: "Highway Racer", desc: "Weave through 3D highway traffic at speed.", url: cdn("highway-racer"), art: "truck",
    thumb: cover("games/highway-racer/cover-1655194175251.png") },
  { id: "highway-racer-2", name: "Highway Racer 2", desc: "Bigger highways, faster cars, tighter gaps.", url: cdn("highway-racer-2"), art: "truck",
    thumb: cover("games/highway-racer-2/cover_16x9-1693297858485.png") },
  { id: "real-simulator-monster-truck", name: "Monster Truck Simulator", desc: "Crawl over everything in a lifted monster truck.", url: cdn("real-simulator-monster-truck"), art: "truck",
    thumb: cover("games/real-simulator-monster-truck/cover-1614699403377.png") },
  { id: "car-crash-simulator-royale", name: "Car Crash Royale", desc: "Crash-test simulation with full 3D damage.", url: cdn("car-crash-simulator-royale"), art: "bomb",
    thumb: cover("games/car-crash-simulator-royale/thumb-1583748169963.png") },
  { id: "gas-monsters", name: "Gas Monsters", desc: "Monster truck racing over ramp obstacles.", url: cdn("gas-monsters"), art: "flame",
    thumb: cover("games/gas-monsters/cover-1631029314256.png") },
  { id: "super-hot", name: "Superhot", desc: "Time moves only when you move. 3D shooter.", url: cdn("super-hot"), art: "target",
    thumb: cover("games/super-hot/thumb-1560179425892.png") },
  { id: "sniper-clash-3d", name: "Sniper Clash 3D", desc: "Long-range 3D sniping duels.", url: cdn("sniper-clash-3d"), art: "crosshair",
    thumb: cover("games/sniper-clash-3d/cover-1584470271989.png") },
  { id: "zombie-outbreak-arena", name: "Zombie Outbreak Arena", desc: "Hold the arena against waves of 3D zombies.", url: cdn("zombie-outbreak-arena"), art: "skull",
    thumb: cover("games/zombie-outbreak-arena/thumb-1560257367984.png") },
  { id: "zombie-world", name: "Zombie World", desc: "Survive a 3D open world overrun by the dead.", url: cdn("zombie-world"), art: "ghost",
    thumb: cover("games/zombie-world/cover_16x9-1707829959035.png") },
  { id: "rocket-bot-royale", name: "Rocket Bot Royale", desc: "Battle-royale tanks with rockets and physics.", url: cdn("rocket-bot-royale"), art: "rocket",
    thumb: cover("games/rocket-bot-royale/cover_16x9-1732723484943.png") },
  { id: "boxing-random", name: "Boxing Random", desc: "Floppy 3D boxing, knock the rival out.", url: cdn("boxing-random"), art: "swords",
    thumb: cover("games/boxing-random/cover-1622139160089.jpeg") },
  { id: "3d-free-kick", name: "3D Free Kick", desc: "Bend free kicks past a live wall.", url: cdn("3d-free-kick"), art: "target",
    thumb: "/games/3d-free-kick.jpg" },
  { id: "parkour-block-3d", name: "Parkour Block 3D", desc: "Jump across floating blocks to the goal.", url: cdn("parkour-block-3d"), art: "runner",
    thumb: "/games/parkour-block-3d.jpg" },
  { id: "traffic-run", name: "Traffic Run", desc: "Run across a chaotic 3D intersection.", url: cdn("traffic-run"), art: "bike",
    thumb: "/games/traffic-run.jpg" },
  { id: "paper-minecraft", name: "Paper Minecraft", desc: "Voxel sandbox: mine, build, explore.", url: cdn("paper-minecraft"), art: "blocks",
    thumb: cover("games/paper-minecraft/cover-1655211126030.png") },
  { id: "block-tech-epic-sandbox", name: "Block Tech Sandbox", desc: "Build and destroy with block physics.", url: cdn("block-tech-epic-sandbox"), art: "grid",
    thumb: cover("games/block-tech-epic-sandbox/thumb-1562173182215.png") },
  { id: "pool-club", name: "Pool Club", desc: "3D eight-ball with real table physics.", url: cdn("pool-club"), art: "ball",
    thumb: cover("games/pool-club/cover-1624014574246.png") },
  { id: "3d-bowling", name: "3D Bowling", desc: "Strike out on a full 3D lane.", url: cdn("3d-bowling"), art: "ball",
    thumb: cover("games/3d-bowling/cover-1685509607375.png") },
  { id: "stickman-fighting-3d", name: "Stickman Fighting 3D", desc: "Combo stickman brawler in 3D.", url: cdn("stickman-fighting-3d"), art: "swords",
    thumb: cover("games/stickman-fighting-3d/thumb-1573276500924.png") },
  { id: "crazy-roll-3d", name: "Crazy Roll 3D", desc: "Roll a ball through twisting 3D obstacles.", url: cdn("crazy-roll-3d"), art: "dice",
    thumb: cover("games/crazy-roll-3d/cover_16x9-1709124312204.png") },
  { id: "ships-3d", name: "Ships 3D", desc: "Naval warfare on open 3D water.", url: cdn("ships-3d"), art: "anchor",
    thumb: cover("games/ships-3d/cover-1656950535291.png") },
  { id: "marble-run", name: "Marble Run", desc: "Guide a marble down wild 3D tracks.", url: cdn("marble-run"), art: "waves",
    thumb: cover("games/marble-run/thumb-1580986927844.png") },
];

const PAIRS: [string, string][] = [
  ["#0f3d2e", "#37b77c"], ["#241954", "#7a5cff"], ["#3b1010", "#ff6b4a"],
  ["#082b3a", "#38bdf8"], ["#3a2506", "#f5b342"], ["#2a0f34", "#e879f9"],
];

export function trendingCover(id: string): { from: string; to: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const [from, to] = PAIRS[h % PAIRS.length];
  return { from, to };
}
