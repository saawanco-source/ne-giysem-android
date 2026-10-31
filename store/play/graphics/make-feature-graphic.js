// Ne Giysem? — Google Play feature graphics (1024×500, 24-bit PNG, no alpha).
//
//   node store/play/graphics/make-feature-graphic.js
//
// Writes feature-graphic.png (Turkish tagline) and feature-graphic-en.png (English tagline) next to this file.
// The look is the app's ("Kumaş ve ışık"): a mild day's sky, the paper tag with the temperature, the name in Instrument
// Serif, and the app's own garments on clothes rails — the garment drawings (ART, rackArt) are read from
// web/index.html, so the graphic follows the app when a drawing changes. Fonts: store/play/fonts (Instrument Serif,
// Figtree; SIL OFL 1.1). Play guidance followed: focal point and all text in the centre, only background art toward
// the edges, no "free"/"best"/ranking words, not white/black/dark grey.
// https://support.google.com/googleplay/android-developer/answer/9866151
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const INDEX = path.join(ROOT, "web", "index.html");
const FONTS = path.join(__dirname, "..", "fonts");
const W = 1024, H = 500;
const SAFE = { left: 96, right: W - 96, top: 48, bottom: H - 48 }; // every text box must stay inside this

const VERSIONS = [
  { file: "feature-graphic.png", lang: "tr", tagline: "Havaya göre bugün ne giyeceğin, bir bakışta.", temp: "19°", level: "Ilık" },
  { file: "feature-graphic-en.png", lang: "en", tagline: "Today’s outfit for your weather, at a glance.", temp: "19°", level: "Mild" },
];
// The "Ilık" band's daytime sky (web/index.html: SKY_DAY[5]).
const SKY = ["#F3BB6C", "#F8DAAA", "#FCEEDB"];

/* ---- the app's garment drawings, straight from web/index.html ---- */
function loadArt() {
  const src = fs.readFileSync(INDEX, "utf8");
  const a = src.indexOf("  /* ================= garments: fabric"), b = src.indexOf("  var G = {tshirt", a);
  if (a < 0 || b < 0) throw new Error("could not find the garment drawings (garments: fabric … var G) in web/index.html");
  const box = {};
  vm.runInNewContext('var BOTTOMS = ["jean","pantolon","sort","tayt"], SHOES = ["sneaker","spor","bot","yuruyus","sandalet"];\n' +
    src.slice(a, b) + "\n;this.rackArt = rackArt; this.rackKind = rackKind;", box);
  return box;
}

function fontFace() {
  const b64 = (f) => fs.readFileSync(path.join(FONTS, f)).toString("base64");
  const EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
  const LAT = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
  const serif = (style, file) => `@font-face{font-family:"Instrument Serif";font-weight:400;font-style:${style};font-display:block;` +
    `src:url(data:font/ttf;base64,${b64(file)}) format("truetype");}`;
  const figtree = (file, range) => `@font-face{font-family:"Figtree";font-weight:300 900;font-style:normal;font-display:block;` +
    `src:url(data:font/woff2;base64,${b64(file)}) format("woff2");unicode-range:${range};}`;
  return [serif("normal", "InstrumentSerif-Regular.ttf"), serif("italic", "InstrumentSerif-Italic.ttf"),
    figtree("figtree-latin-ext-wght-normal.woff2", EXT), figtree("figtree-latin-wght-normal.woff2", LAT)].join("\n");
}

// Sun icon from the app (icon("sun")), on the tag.
const SUN = (() => {
  let s = ""; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; s += `<line x1="${(12 + Math.cos(a) * 6.6).toFixed(2)}" y1="${(12 + Math.sin(a) * 6.6).toFixed(2)}" x2="${(12 + Math.cos(a) * 8.8).toFixed(2)}" y2="${(12 + Math.sin(a) * 8.8).toFixed(2)}"/>`; }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/>${s}</svg>`;
})();

// Two short rails at the edges, garments hanging from them ([garment, x, width]), and shoes on the floor below.
const RAILS = [
  { x: 14, w: 236, y: 58, items: [["kazak", 22, 112], ["jean", 136, 96]] },
  { x: 774, w: 236, y: 58, items: [["yagmurluk", 788, 112], ["semsiye", 906, 92]] },
];
const FLOOR = [["sneaker", 40, 378, 124, -3], ["bot", 868, 362, 112, 4]];

function page(art, v) {
  const rails = RAILS.map((r) => `<div class="rail" style="left:${r.x}px;top:${r.y}px;width:${r.w}px"></div>` +
    r.items.map(([g, x, w]) => `<div class="hang" style="left:${x}px;top:${r.y - 6}px;width:${w}px">${art.rackArt(g)}</div>`).join("")).join("");
  const floor = FLOOR.map(([g, x, y, w, rot]) => `<div class="floor" style="left:${x}px;top:${y}px;width:${w}px;transform:rotate(${rot}deg)">${art.rackArt(g)}</div>`).join("");
  return `<!doctype html><html lang="${v.lang}"><head><meta charset="utf-8"><style>
${fontFace()}
*{box-sizing:border-box;margin:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{color:#1d1b14;font-family:"Figtree",sans-serif;position:relative;
  background:radial-gradient(circle at 88% -4%,rgba(255,250,230,.92) 0,transparent 46%),radial-gradient(ellipse 80% 30% at 6% 34%,rgba(255,255,255,.3),transparent 70%),linear-gradient(180deg,${SKY[0]} 0%,${SKY[1]} 44%,${SKY[2]} 100%)}
body::after{content:"";position:absolute;inset:0;background-image:var(--grain);background-size:180px;opacity:.42;mix-blend-mode:soft-light;pointer-events:none}
.rail{position:absolute;height:7px;border-radius:4px;background:linear-gradient(180deg,#FBFAF6,#C6C9CF 45%,#868A93);box-shadow:0 4px 8px rgba(70,45,10,.22)}
.hang,.floor{position:absolute;filter:drop-shadow(0 10px 9px rgba(70,45,10,.26))}
.hang svg,.floor svg{display:block;width:100%;height:auto}
.hang{transform-origin:50% 4px}
.hang:nth-of-type(odd){transform:rotate(-2deg)}.hang:nth-of-type(even){transform:rotate(2.5deg)}
.mid{position:absolute;left:50%;top:0;transform:translateX(-50%);width:560px;height:${H}px;text-align:center}
.tag{position:absolute;left:50%;top:62px;width:106px;height:138px;margin-left:-53px;transform:rotate(5deg);transform-origin:53px -22px;
  filter:drop-shadow(0 12px 14px rgba(70,45,10,.28)) drop-shadow(0 2px 2px rgba(0,0,0,.14))}
.tag-str{position:absolute;left:50%;top:-62px;width:30px;height:80px;margin-left:-15px;overflow:visible}
.tag-body{position:absolute;inset:0;clip-path:polygon(22% 0,78% 0,100% 14%,100% 100%,0 100%,0 14%);background:radial-gradient(ellipse at 30% 18%,#FFFDF6 0,#EADFC4 100%)}
.tag-body::before{content:"";position:absolute;inset:6px;clip-path:polygon(22% 0,78% 0,100% 14%,100% 100%,0 100%,0 14%);border:1.2px dashed #9C4A2A;opacity:.55}
.tag-body::after{content:"";position:absolute;left:50%;top:9px;width:16px;height:16px;margin-left:-8px;border-radius:50%;
  background:radial-gradient(circle,${SKY[1]} 0 3.3px,#6E5020 3.6px 4.3px,#EBD397 5px,#9A7838 8px)}
.big{position:absolute;left:0;right:0;top:30px;font:400 56px/1 "Instrument Serif",serif;letter-spacing:-.02em}
.lvl{position:absolute;left:6px;right:6px;top:91px;font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#9C4A2A}
.ic{position:absolute;left:0;right:0;bottom:11px;display:flex;justify-content:center}.ic svg{width:22px;height:22px}
h1{position:absolute;left:0;right:0;top:214px;font:400 112px/1 "Instrument Serif",serif;letter-spacing:-.01em;white-space:nowrap}
h1 em{font-style:italic;text-decoration-line:underline;text-decoration-style:dashed;text-decoration-color:#9C4A2A;text-decoration-thickness:3px;text-underline-offset:.13em;text-decoration-skip-ink:none}
p{position:absolute;left:0;right:0;top:362px;font-weight:600;font-size:27px;line-height:1.2;letter-spacing:-.005em;white-space:nowrap;color:rgba(29,27,20,.86)}
</style></head><body>
${rails}${floor}
<div class="mid">
  <div class="tag"><svg class="tag-str" viewBox="0 0 30 80" aria-hidden="true"><path d="M15 0Q10.5 40 15 76M15 0Q19.5 40 15 76" fill="none" stroke="#7A6A4A" stroke-width="1.2"/></svg>
    <div class="tag-body"><span class="big">${v.temp}</span><span class="lvl">${v.level}</span><span class="ic">${SUN}</span></div></div>
  <h1 id="title">Ne <em>Giysem?</em></h1>
  <p id="tag">${v.tagline}</p>
</div>
<script>
  // the app's film grain (web/index.html: makeGrain)
  (function () { var n = 160, c = document.createElement("canvas"); c.width = c.height = n;
    var g = c.getContext("2d"), im = g.createImageData(n, n), d = im.data, s = 7;
    for (var i = 0; i < d.length; i += 4) { s = (s * 16807) % 2147483647; var v = s % 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(im, 0, 0); document.documentElement.style.setProperty("--grain", 'url("' + c.toDataURL("image/png") + '")'); })();
</script>
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
      const fontsOk = await p.evaluate(() => document.fonts.check('400 112px "Instrument Serif"') && document.fonts.check('italic 400 112px "Instrument Serif"') && document.fonts.check('600 27px "Figtree"'));
      const boxes = await p.$$eval(".mid h1, .mid p, .tag", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { el: e.tagName.toLowerCase() + (e.className ? "." + e.className : ""), l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
      // the text's own width (h1 and p span the column; measure their contents)
      const ink = await p.$$eval(".mid h1, .mid p", (els) => els.map((e) => { const rg = document.createRange(); rg.selectNodeContents(e); const r = rg.getBoundingClientRect(); return { el: e.tagName.toLowerCase(), l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
      const all = boxes.filter((b) => b.el.startsWith("div")).concat(ink);
      const out = all.filter((b) => b.l < SAFE.left || b.r > SAFE.right || b.t < SAFE.top || b.b > SAFE.bottom);
      const file = path.join(__dirname, v.file);
      await p.screenshot({ path: file, type: "png" });
      await p.close();
      const b = fs.readFileSync(file);
      console.log(`${v.file}: ${b.readUInt32BE(16)}×${b.readUInt32BE(20)}, colour type ${b[25]} (${b[25] === 2 ? "RGB, no alpha" : "HAS ALPHA/PALETTE"}), ` +
        `${(b.length / 1024).toFixed(0)} KB, fonts ${fontsOk ? "ok" : "MISSING"}, text ${out.length ? "OUTSIDE safe area: " + JSON.stringify(out) : "inside safe area"} ` +
        all.map((x) => `[${x.el} ${Math.round(x.l)}–${Math.round(x.r)} × ${Math.round(x.t)}–${Math.round(x.b)}]`).join(" "));
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
