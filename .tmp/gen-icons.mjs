// Scratch generator: renders the CONNEXA emblem into the icon set.
// Not committed; public/icon.svg is the human-editable source.
import sharp from "sharp";
import { writeFileSync } from "fs";

const FMT = (scale, ring, link) => {
  const body = `
    <line x1="24" y1="15" x2="24" y2="18" stroke="#9EBFAB" stroke-width="${link}" stroke-linecap="round"/>
    <line x1="31.5" y1="28.5" x2="28.5" y2="26.5" stroke="#9EBFAB" stroke-width="${link}" stroke-linecap="round"/>
    <line x1="16.5" y1="28.5" x2="19.5" y2="26.5" stroke="#9EBFAB" stroke-width="${link}" stroke-linecap="round"/>
    <circle cx="24" cy="24" r="7" fill="#ECC96C"/>
    <circle cx="24" cy="10" r="5" fill="#C5D8CC"/>
    <circle cx="36" cy="32" r="5" fill="#C5D8CC" opacity="0.82"/>
    <circle cx="12" cy="32" r="5" fill="#C5D8CC" opacity="0.82"/>
    <circle cx="24" cy="24" r="21" stroke="#D6B875" stroke-width="${ring}" stroke-dasharray="4 3" opacity="0.45"/>`;
  const inner = scale === 1 ? body : `<g transform="translate(24 24) scale(${scale}) translate(-24 -24)">${body}</g>`;
  return (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" fill="#12372A"/>${inner}</svg>`;
};

// Plain emblem, exactly as the site draws it.
const brand = FMT(1, 1.5, 1.5);
// Same mark, scaled into the Android adaptive-icon safe zone (66% of the tile).
const maskable = FMT(0.7, 1.9, 2.6);

const jobs = [
  ["public/favicon.png", 32, brand],
  ["public/icon-192.png", 192, brand],
  ["public/icon-512.png", 512, brand],
  ["public/apple-touch-icon.png", 180, brand],
  ["public/icon-maskable-192.png", 192, maskable],
  ["public/icon-maskable-512.png", 512, maskable],
];

const render = async (markup, px) =>
  sharp(Buffer.from(markup(px)), { density: 300 }).resize(px, px, { fit: "contain" }).png().toBuffer();

for (const [path, px, fn] of jobs) {
  const buf = await render(fn, px);
  writeFileSync(path, buf);
  console.log(path, px + "px", buf.length + " bytes");
}

// ICO entries are PNG payloads, which every Windows shell since Vista accepts.
const sizes = [16, 32, 48];
const payloads = [];
for (const px of sizes) payloads.push(await render(brand, px));

const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((px, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(px, e);
  header.writeUInt8(px, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(payloads[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += payloads[i].length;
});
const ico = Buffer.concat([header, ...payloads]);
writeFileSync("public/favicon.ico", ico);
console.log("public/favicon.ico", sizes.join("/") + "px", ico.length + " bytes");
