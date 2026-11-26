// One-off: the supplied crown is a JPEG, so its "transparency" is a painted
// checkerboard. Gold is chromatic and the checkerboard is neutral, so chroma
// separates them cleanly. Run with: node .tmp/crown/make.js
const sharp = require("sharp");
const path = require("path");

const SRC = path.join(__dirname, "crown.jpg");
const OUT = path.join(__dirname, "..", "..", "public", "crown.png");

(async () => {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      // Neutral and light = checkerboard or the drop shadow underneath it.
      const light = (r + g + b) / 3 > 112;
      let a = 255;
      if (light && chroma <= 16) a = 0;
      else if (light && chroma < 40) a = Math.round(((chroma - 16) / 24) * 255);
      data[i + 3] = a;
      if (a > 120) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) throw new Error("nothing survived the key — check the thresholds");

  // The source paints a detached drop shadow under the crown. Cut at the last
  // substantial row so the badge is the crown itself, not crown plus empty air.
  const cover = [];
  let peak = 0;
  for (let y = minY; y <= maxY; y++) {
    let c = 0;
    for (let x = minX; x <= maxX; x++) if (data[(y * width + x) * channels + 3] > 120) c++;
    cover.push(c);
    if (c > peak) peak = c;
  }
  for (let i = cover.length - 1; i >= 0; i--) {
    if (cover[i] >= peak * 0.55) { maxY = minY + i; break; }
  }

  const pad = 8;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const w = Math.min(width - left, maxX - minX + 1 + pad * 2);
  const h = Math.min(height - top, maxY - minY + 1 + pad * 2);
  console.log("bbox", { left, top, w, h });

  const side = Math.max(w, h);
  await sharp(data, { raw: { width, height, channels } })
    .extract({ left, top, width: w, height: h })
    .resize(side, side, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(128, 128, { fit: "fill", kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  const meta = await sharp(OUT).metadata();
  const stat = require("fs").statSync(OUT);
  console.log("wrote", OUT, meta.width + "x" + meta.height, stat.size + " bytes");
})().catch((e) => { console.error(e); process.exit(1); });