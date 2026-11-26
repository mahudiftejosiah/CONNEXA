const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "..", "public", "stickers");
fs.mkdirSync(OUT, { recursive: true });

// Every sticker is die-cut: a white keyline around a coloured body, the way a
// printed sticker looks. Faces and props are drawn, not typed, so they render
// identically on every device.
const STICKERS = [
  { id: "wave",    cat: "greetings", word: "HI!",    from: "#FFD166", to: "#F4813F", eyes: "happy",  mouth: "grin",  prop: "hand" },
  { id: "hello",   cat: "greetings", word: "HELLO",  from: "#7AE582", to: "#12A594", eyes: "dot",    mouth: "smile", prop: "spark" },
  { id: "sun",     cat: "greetings", word: "MORNING",from: "#FFE066", to: "#FF9F1C", eyes: "closed", mouth: "smile", prop: "rays" },
  { id: "peace",   cat: "greetings", word: "PEACE",  from: "#9BF6FF", to: "#3A86FF", eyes: "happy",  mouth: "smile", prop: "hand" },

  { id: "love",    cat: "feelings",  word: "LOVE",   from: "#FF8FAB", to: "#E5383B", eyes: "heart",  mouth: "smile", prop: "hearts" },
  { id: "happy",   cat: "feelings",  word: "YAY",    from: "#FFE066", to: "#FFB703", eyes: "happy",  mouth: "grin",  prop: "spark" },
  { id: "cool",    cat: "feelings",  word: "COOL",   from: "#8ECAE6", to: "#023047", eyes: "shades", mouth: "smirk", prop: "spark" },
  { id: "laugh",   cat: "feelings",  word: "LOL",    from: "#FFD6A5", to: "#FB8500", eyes: "closed", mouth: "open",  prop: "tears" },
  { id: "sad",     cat: "feelings",  word: "AWW",    from: "#A2D2FF", to: "#3D5A80", eyes: "sad",    mouth: "frown", prop: "tear" },
  { id: "wow",     cat: "feelings",  word: "WOW",    from: "#CDB4DB", to: "#7209B7", eyes: "wide",   mouth: "o",     prop: "spark" },
  { id: "sleepy",  cat: "feelings",  word: "ZZZ",    from: "#BDE0FE", to: "#5390D9", eyes: "closed", mouth: "flat",  prop: "zzz" },
  { id: "angry",   cat: "feelings",  word: "GRR",    from: "#FFADAD", to: "#D00000", eyes: "angry",  mouth: "frown", prop: "steam" },

  { id: "party",   cat: "celebrate", word: "PARTY",  from: "#FFC8DD", to: "#FF006E", eyes: "happy",  mouth: "open",  prop: "hat" },
  { id: "star",    cat: "celebrate", word: "NICE",   from: "#FFF3B0", to: "#FFB703", eyes: "star",   mouth: "grin",  prop: "spark" },
  { id: "fire",    cat: "celebrate", word: "FIRE",   from: "#FFB703", to: "#DC2F02", eyes: "shades", mouth: "grin",  prop: "flame" },
  { id: "clap",    cat: "celebrate", word: "BRAVO",  from: "#B8F2E6", to: "#0FA3B1", eyes: "happy",  mouth: "grin",  prop: "confetti" },
];

const EYES = {
  dot:    `<circle cx="98" cy="112" r="10" fill="#2B2118"/><circle cx="158" cy="112" r="10" fill="#2B2118"/>`,
  happy:  `<path d="M86 116q12-16 24 0" stroke="#2B2118" stroke-width="9" fill="none" stroke-linecap="round"/>
           <path d="M146 116q12-16 24 0" stroke="#2B2118" stroke-width="9" fill="none" stroke-linecap="round"/>`,
  closed: `<path d="M86 112q12 12 24 0" stroke="#2B2118" stroke-width="9" fill="none" stroke-linecap="round"/>
           <path d="M146 112q12 12 24 0" stroke="#2B2118" stroke-width="9" fill="none" stroke-linecap="round"/>`,
  wide:   `<circle cx="98" cy="112" r="16" fill="#fff"/><circle cx="158" cy="112" r="16" fill="#fff"/>
           <circle cx="98" cy="114" r="8" fill="#2B2118"/><circle cx="158" cy="114" r="8" fill="#2B2118"/>`,
  heart:  `<path d="M98 124c-16-11-22-19-22-26a11 11 0 0 1 22-5 11 11 0 0 1 22 5c0 7-6 15-22 26z" fill="#E5383B"/>
           <path d="M158 124c-16-11-22-19-22-26a11 11 0 0 1 22-5 11 11 0 0 1 22 5c0 7-6 15-22 26z" fill="#E5383B"/>`,
  star:   `<path d="M98 96l7 16 17 2-13 12 4 17-15-9-15 9 4-17-13-12 17-2z" fill="#2B2118"/>
           <path d="M158 96l7 16 17 2-13 12 4 17-15-9-15 9 4-17-13-12 17-2z" fill="#2B2118"/>`,
  shades: `<path d="M74 100h108v10H74z" fill="#2B2118"/>
           <rect x="76" y="102" width="44" height="30" rx="10" fill="#2B2118"/>
           <rect x="136" y="102" width="44" height="30" rx="10" fill="#2B2118"/>
           <path d="M82 108l14 14" stroke="#ffffff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>
           <path d="M142 108l14 14" stroke="#ffffff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>`,
  sad:    `<circle cx="98" cy="116" r="10" fill="#2B2118"/><circle cx="158" cy="116" r="10" fill="#2B2118"/>
           <path d="M84 98q14-8 28 0" stroke="#2B2118" stroke-width="7" fill="none" stroke-linecap="round"/>
           <path d="M144 98q14-8 28 0" stroke="#2B2118" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  angry:  `<circle cx="98" cy="118" r="10" fill="#2B2118"/><circle cx="158" cy="118" r="10" fill="#2B2118"/>
           <path d="M82 96l30 12" stroke="#2B2118" stroke-width="8" stroke-linecap="round"/>
           <path d="M174 96l-30 12" stroke="#2B2118" stroke-width="8" stroke-linecap="round"/>`,
};

const MOUTHS = {
  smile: `<path d="M104 148q24 22 48 0" stroke="#2B2118" stroke-width="9" fill="none" stroke-linecap="round"/>`,
  smirk: `<path d="M106 152q26 14 44-6" stroke="#2B2118" stroke-width="9" fill="none" stroke-linecap="round"/>`,
  grin:  `<path d="M100 144q28 34 56 0z" fill="#2B2118"/>
          <path d="M112 158q16 12 32 0q-16-6-32 0z" fill="#FF8FAB"/>`,
  open:  `<ellipse cx="128" cy="156" rx="26" ry="22" fill="#2B2118"/>
          <ellipse cx="128" cy="168" rx="15" ry="9" fill="#FF8FAB"/>`,
  frown: `<path d="M104 160q24-22 48 0" stroke="#2B2118" stroke-width="9" fill="none" stroke-linecap="round"/>`,
  o:     `<ellipse cx="128" cy="156" rx="15" ry="19" fill="#2B2118"/>`,
  flat:  `<path d="M110 156h36" stroke="#2B2118" stroke-width="9" stroke-linecap="round"/>`,
};

const PROPS = {
  hand: `<g transform="translate(196 92) rotate(18)">
           <rect x="-14" y="-6" width="28" height="40" rx="13" fill="#FFD9A0" stroke="#fff" stroke-width="5"/>
           <rect x="-13" y="-30" width="9" height="30" rx="4.5" fill="#FFD9A0" stroke="#fff" stroke-width="4"/>
           <rect x="-2" y="-34" width="9" height="34" rx="4.5" fill="#FFD9A0" stroke="#fff" stroke-width="4"/>
           <rect x="9" y="-30" width="9" height="30" rx="4.5" fill="#FFD9A0" stroke="#fff" stroke-width="4"/>
         </g>
         <path d="M226 60q10 8 8 20" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>
         <path d="M238 48q14 12 11 30" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>`,
  spark: `<path d="M40 62l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="#fff"/>
          <path d="M214 52l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#fff" opacity=".85"/>
          <path d="M206 176l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#fff" opacity=".7"/>`,
  rays: `<g stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".9">
           <path d="M128 16v18"/><path d="M128 222v18"/><path d="M16 128h18"/><path d="M222 128h18"/>
           <path d="M48 48l13 13"/><path d="M195 195l13 13"/><path d="M208 48l-13 13"/><path d="M61 195l-13 13"/>
         </g>`,
  hearts: `<path d="M46 74c-13-9-18-15-18-21a9 9 0 0 1 18-4 9 9 0 0 1 18 4c0 6-5 12-18 21z" fill="#fff"/>
           <path d="M212 96c-10-7-14-12-14-16a7 7 0 0 1 14-3 7 7 0 0 1 14 3c0 4-4 9-14 16z" fill="#fff" opacity=".85"/>
           <path d="M196 46c-8-6-11-9-11-13a6 6 0 0 1 11-2 6 6 0 0 1 11 2c0 4-3 7-11 13z" fill="#fff" opacity=".7"/>`,
  tears: `<path d="M60 130q-14 16 0 24 14-8 0-24z" fill="#7FD3FF"/>
          <path d="M196 130q14 16 0 24-14-8 0-24z" fill="#7FD3FF"/>`,
  tear: `<path d="M98 134q-11 20 0 27 11-7 0-27z" fill="#7FD3FF"/>`,
  zzz: `<g fill="#fff" font-family="Verdana, Geneva, sans-serif" font-weight="bold">
          <text x="186" y="70" font-size="30">z</text>
          <text x="208" y="48" font-size="22" opacity=".8">z</text>
          <text x="224" y="32" font-size="16" opacity=".6">z</text>
        </g>`,
  steam: `<g stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".9">
            <path d="M62 66q10-10 0-20"/><path d="M194 66q-10-10 0-20"/>
          </g>`,
  hat: `<path d="M128 12l34 62h-68z" fill="#3A86FF" stroke="#fff" stroke-width="6"/>
        <path d="M110 46h36" stroke="#FFD166" stroke-width="8"/>
        <circle cx="128" cy="12" r="11" fill="#FF006E" stroke="#fff" stroke-width="5"/>`,
  flame: `<path d="M128 6c14 22 34 30 34 52a34 34 0 0 1-68 0c0-12 8-18 14-28 4 8 10 10 14 6 6-6 4-18 6-30z" fill="#FF4800" stroke="#fff" stroke-width="6"/>
          <path d="M128 30c7 12 16 16 16 26a16 16 0 0 1-32 0c0-8 10-14 16-26z" fill="#FFD166"/>`,
  confetti: `<g stroke-linecap="round" stroke-width="7">
               <path d="M36 60l10 12" stroke="#FF006E"/><path d="M212 56l-10 12" stroke="#3A86FF"/>
               <path d="M52 176l12-8" stroke="#FFB703"/><path d="M206 180l-12-8" stroke="#7AE582"/>
               <path d="M128 22v14" stroke="#FF006E"/><path d="M28 116h14" stroke="#FFB703"/>
               <path d="M214 116h14" stroke="#7AE582"/>
             </g>`,
};

function svgFor(s) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="${s.word} sticker">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${s.from}"/>
      <stop offset="1" stop-color="${s.to}"/>
    </linearGradient>
    <radialGradient id="sheen" cx="0.32" cy="0.24" r="0.6">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".55"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="128" cy="128" r="104" fill="#ffffff"/>
  <circle cx="128" cy="128" r="96" fill="url(#g)"/>
  <circle cx="128" cy="128" r="96" fill="url(#sheen)"/>
  ${PROPS[s.prop]}
  ${EYES[s.eyes]}
  ${MOUTHS[s.mouth]}
  <g>
    <rect x="${128 - Math.max(136, s.word.length * 20 + 30) / 2}" y="188" width="${Math.max(136, s.word.length * 20 + 30)}" height="38" rx="19" fill="#ffffff"/>
    <text x="128" y="215" text-anchor="middle" font-family="Verdana, Geneva, sans-serif" font-size="24" font-weight="bold" fill="${s.to}">${s.word}</text>
  </g>
</svg>
`;
}

for (const s of STICKERS) {
  fs.writeFileSync(path.join(OUT, s.id + ".svg"), svgFor(s), "utf8");
}

const manifest = STICKERS.map((s) => ({ id: s.id, cat: s.cat, word: s.word, url: `/stickers/${s.id}.svg` }));
fs.writeFileSync(path.join(__dirname, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("wrote", STICKERS.length, "stickers to", OUT);