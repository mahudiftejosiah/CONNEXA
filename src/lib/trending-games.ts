export type TrendingGame = {
  id: string;
  name: string;
  desc: string;
  url: string;
  art: TrendingArt;
};

/** Art keys are mapped to icons + colours in the Games tab client. */
export type TrendingArt =
  | "car" | "truck" | "crosshair" | "ball" | "snowflake" | "bomb" | "flame"
  | "target" | "skull" | "ghost" | "rocket" | "swords" | "runner" | "bike"
  | "blocks" | "grid" | "dice" | "anchor" | "waves";

const cdn = (slug: string) => `https://games.crazygames.com/en_US/${slug}/index.html`;

// Every slug below was verified to serve a 200 with no X-Frame-Options / CSP
// header, so it actually renders inside our iframe.
export const TRENDING_3D: TrendingGame[] = [
  { id: "drift-hunters", name: "Drift Hunters", desc: "Tune a drift machine and tear up open 3D tracks.", url: cdn("drift-hunters"), art: "car" },
  { id: "pixel-gun-3d", name: "Pixel Gun 3D", desc: "Blocky multiplayer shooter with dozens of maps.", url: cdn("pixel-gun-3d"), art: "crosshair" },
  { id: "basketball-stars", name: "Basketball Stars", desc: "Fast 3D street basketball, one-on-one.", url: cdn("basketball-stars"), art: "ball" },
  { id: "soccer-random", name: "Soccer Random", desc: "Wobbly 3D football physics against a rival.", url: cdn("soccer-random"), art: "ball" },
  { id: "snow-rider-3d", name: "Snow Rider 3D", desc: "Sled downhill at speed, dodge the trees.", url: cdn("snow-rider-3d"), art: "snowflake" },
  { id: "madalin-stunt-cars-2", name: "Madalin Stunt Cars 2", desc: "Supercars, loops and an open 3D city.", url: cdn("madalin-stunt-cars-2"), art: "car" },
  { id: "madalin-cars-multiplayer", name: "Madalin Cars Multiplayer", desc: "Race real cars online against other drivers.", url: cdn("madalin-cars-multiplayer"), art: "car" },
  { id: "3d-car-simulator", name: "3D Car Simulator", desc: "Sandbox driving, parking and crashing physics.", url: cdn("3d-car-simulator"), art: "car" },
  { id: "highway-racer", name: "Highway Racer", desc: "Weave through 3D highway traffic at speed.", url: cdn("highway-racer"), art: "truck" },
  { id: "highway-racer-2", name: "Highway Racer 2", desc: "Bigger highways, faster cars, tighter gaps.", url: cdn("highway-racer-2"), art: "truck" },
  { id: "real-simulator-monster-truck", name: "Monster Truck Simulator", desc: "Crawl over everything in a lifted monster truck.", url: cdn("real-simulator-monster-truck"), art: "truck" },
  { id: "car-crash-simulator-royale", name: "Car Crash Royale", desc: "Crash-test simulation with full 3D damage.", url: cdn("car-crash-simulator-royale"), art: "bomb" },
  { id: "gas-monsters", name: "Gas Monsters", desc: "Monster truck racing over ramp obstacles.", url: cdn("gas-monsters"), art: "flame" },
  { id: "super-hot", name: "Superhot", desc: "Time moves only when you move. 3D shooter.", url: cdn("super-hot"), art: "target" },
  { id: "sniper-clash-3d", name: "Sniper Clash 3D", desc: "Long-range 3D sniping duels.", url: cdn("sniper-clash-3d"), art: "crosshair" },
  { id: "zombie-outbreak-arena", name: "Zombie Outbreak Arena", desc: "Hold the arena against waves of 3D zombies.", url: cdn("zombie-outbreak-arena"), art: "skull" },
  { id: "zombie-world", name: "Zombie World", desc: "Survive a 3D open world overrun by the dead.", url: cdn("zombie-world"), art: "ghost" },
  { id: "rocket-bot-royale", name: "Rocket Bot Royale", desc: "Battle-royale tanks with rockets and physics.", url: cdn("rocket-bot-royale"), art: "rocket" },
  { id: "boxing-random", name: "Boxing Random", desc: "Floppy 3D boxing, knock the rival out.", url: cdn("boxing-random"), art: "swords" },
  { id: "3d-free-kick", name: "3D Free Kick", desc: "Bend free kicks past a live wall.", url: cdn("3d-free-kick"), art: "target" },
  { id: "parkour-block-3d", name: "Parkour Block 3D", desc: "Jump across floating blocks to the goal.", url: cdn("parkour-block-3d"), art: "runner" },
  { id: "traffic-run", name: "Traffic Run", desc: "Run across a chaotic 3D intersection.", url: cdn("traffic-run"), art: "bike" },
  { id: "paper-minecraft", name: "Paper Minecraft", desc: "Voxel sandbox: mine, build, explore.", url: cdn("paper-minecraft"), art: "blocks" },
  { id: "block-tech-epic-sandbox", name: "Block Tech Sandbox", desc: "Build and destroy with block physics.", url: cdn("block-tech-epic-sandbox"), art: "grid" },
  { id: "pool-club", name: "Pool Club", desc: "3D eight-ball with real table physics.", url: cdn("pool-club"), art: "ball" },
  { id: "3d-bowling", name: "3D Bowling", desc: "Strike out on a full 3D lane.", url: cdn("3d-bowling"), art: "ball" },
  { id: "stickman-fighting-3d", name: "Stickman Fighting 3D", desc: "Combo stickman brawler in 3D.", url: cdn("stickman-fighting-3d"), art: "swords" },
  { id: "crazy-roll-3d", name: "Crazy Roll 3D", desc: "Roll a ball through twisting 3D obstacles.", url: cdn("crazy-roll-3d"), art: "dice" },
  { id: "ships-3d", name: "Ships 3D", desc: "Naval warfare on open 3D water.", url: cdn("ships-3d"), art: "anchor" },
  { id: "marble-run", name: "Marble Run", desc: "Guide a marble down wild 3D tracks.", url: cdn("marble-run"), art: "waves" },
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
