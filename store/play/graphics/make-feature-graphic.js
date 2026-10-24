// Ne Giysem? — Google Play feature graphics (1024×500, 24-bit PNG, no alpha).
//
//   node store/play/graphics/make-feature-graphic.js
//
// Writes feature-graphic.png (Turkish tagline) and feature-graphic-en.png (English tagline) next to this file.
// The garment stickers are the app's own SVG art: the ART object and art(g) function are read from web/index.html,
// so the graphic follows the app when a sticker changes. Fonts: store/play/fonts (Bricolage Grotesque, Figtree; SIL OFL 1.1).
// Play guidance followed: focal point and all text in the centre, only background stickers toward the edges,
// no "free"/"best"/ranking words, not white/black/dark grey. https://support.google.com/googleplay/android-developer/answer/9866151
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const INDEX = path.join(ROOT, "web", "index.html");
const FONTS = path.join(__dirname, "..", "fonts");
const W = 1024, H = 500;
const SAFE = { left: 96, right: W - 96, top: 48, bottom: H - 48 }; // every text box must stay inside this

const VERSIONS = [
  { file: "feature-graphic.png", lang: "tr", tagline: "Havaya göre bugün ne giyeceğin, bir bakışta.", pills: ["19°", "Ilık", "Akşam 14°"] },
  { file: "feature-graphic-en.png", lang: "en", tagline: "Today’s outfit for your weather, at a glance.", pills: ["19°", "Mild", "Evening 14°"] },
];

/* ---- the app's sticker art, straight from web/index.html ---- */
function loadArt() {
  const src = fs.readFileSync(INDEX, "utf8");
  const a = src.indexOf('var INK = "'), fnAt = src.indexOf("function art(g)", a);
  if (a < 0 || fnAt < 0) throw new Error("could not find the sticker art (var INK … function art(g)) in web/index.html");
  const end = src.indexOf("\n", fnAt);
  const box = {};
  vm.runInNewContext(src.slice(a, end) + "\n;this.art = art; this.ART = ART;", box);
  return box;
}

function fontFace() {
  const face = (fam, file, weight, range) =>
    `@font-face{font-family:"${fam}";font-weight:${weight};font-style:normal;font-display:block;` +
    `src:url(data:font/woff2;base64,${fs.readFileSync(path.join(FONTS, file)).toString("base64")}) format("woff2");unicode-range:${range};}`;
  const EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
  const LAT = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
  return [
    face("Bricolage Grotesque", "bricolage-grotesque-latin-ext-opsz-normal.woff2", "200 800", EXT),
    face("Bricolage Grotesque", "bricolage-grotesque-latin-opsz-normal.woff2", "200 800", LAT),
    face("Figtree", "figtree-latin-ext-wght-normal.woff2", "300 900", EXT),
    face("Figtree", "figtree-latin-wght-normal.woff2", "300 900", LAT),
  ].join("\n");
}

// Sun icon from the app (icon("sun")), for the temperature pill.
const SUN = (() => {
  let s = ""; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; s += `<line x1="${(12 + Math.cos(a) * 6.6).toFixed(2)}" y1="${(12 + Math.sin(a) * 6.6).toFixed(2)}" x2="${(12 + Math.cos(a) * 8.8).toFixed(2)}" y2="${(12 + Math.sin(a) * 8.8).toFixed(2)}"/>`; }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/>${s}</svg>`;
})();

// Background stickers: [garment, x, y, size, rotation]; only the outer bands, so the centre stays for the text.
const STICKERS = [
  ["kazak", 22, 26, 160, -9], ["tshirt", 20, 296, 150, 6], ["bere", 214, 372, 112, 9],
  ["yagmurluk", 846, 22, 160, 8], ["semsiye", 862, 292, 146, -7], ["sneaker", 690, 366, 136, -5],
];

function page(art, v) {
  const stickers = STICKERS.map(([g, x, y, s, r]) =>
    `<div class="stk" style="left:${x}px;top:${y}px;width:${s}px;height:${s}px;--r:${r}deg">${art.art(g)}</div>`).join("");
  const [t, lvl, later] = v.pills;
  return `<!doctype html><html lang="${v.lang}"><head><meta charset="utf-8"><style>
${fontFace()}
*{box-sizing:border-box;margin:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:#FFD65E;color:#14161f;font-family:"Figtree",sans-serif;position:relative}
body::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse 520px 300px at 50% 52%,rgba(255,255,255,.42),rgba(255,255,255,0) 70%)}
.stk{position:absolute;transform:rotate(var(--r))}
.stk svg{width:100%;height:100%;display:block;filter:drop-shadow(5px 0 0 #fff) drop-shadow(-5px 0 0 #fff) drop-shadow(0 5px 0 #fff) drop-shadow(0 -5px 0 #fff) drop-shadow(0 14px 16px rgba(20,22,31,.28))}
.mid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;text-align:center;width:640px}
.pills{display:flex;gap:10px;margin-bottom:18px}
.pill{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:8px 16px;font-weight:700;font-size:22px;line-height:1;background:rgba(255,255,255,.8)}
.pill.ink{background:#14161f;color:#fff}
.pill svg{width:24px;height:24px}
h1{font:800 124px/0.98 "Bricolage Grotesque",sans-serif;letter-spacing:-.04em;white-space:nowrap}
.hl{display:inline-block;background:#fff;padding:0 .14em .05em;border-radius:.2em;transform:rotate(-2deg);margin-left:.08em}
p{margin-top:22px;font-weight:700;font-size:29px;line-height:1.2;letter-spacing:-.005em;white-space:nowrap}
</style></head><body>
${stickers}
<div class="mid">
  <div class="pills"><span class="pill">${SUN}${t}</span><span class="pill">${lvl}</span><span class="pill ink">${later}</span></div>
  <h1 id="title">Ne <span class="hl">Giysem?</span></h1>
  <p id="tag">${v.tagline}</p>
</div>
</body></html>`;
}

(async () => {
  const art = loadArt();
  const browser = await chromium.launch();
  try {
    for (const v of VERSIONS) {
      const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      await p.setContent(page(art, v), { waitUntil: "load" });
      await p.evaluate(() => document.fonts.ready);
      const fontsOk = await p.evaluate(() => document.fonts.check('800 124px "Bricolage Grotesque"') && document.fonts.check('700 29px "Figtree"'));
      const boxes = await p.$$eval(".mid h1, .mid p, .pills", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { el: e.tagName.toLowerCase() + (e.className ? "." + e.className : ""), l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
      const out = boxes.filter((b) => b.l < SAFE.left || b.r > SAFE.right || b.t < SAFE.top || b.b > SAFE.bottom);
      const file = path.join(__dirname, v.file);
      await p.screenshot({ path: file, type: "png" });
      await p.close();
      const b = fs.readFileSync(file);
      console.log(`${v.file}: ${b.readUInt32BE(16)}×${b.readUInt32BE(20)}, colour type ${b[25]} (${b[25] === 2 ? "RGB, no alpha" : "HAS ALPHA/PALETTE"}), ` +
        `${(b.length / 1024).toFixed(0)} KB, fonts ${fontsOk ? "ok" : "MISSING"}, text ${out.length ? "OUTSIDE safe area: " + JSON.stringify(out) : "inside safe area"} ` +
        boxes.map((x) => `[${x.el} ${Math.round(x.l)}–${Math.round(x.r)} × ${Math.round(x.t)}–${Math.round(x.b)}]`).join(" "));
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
