// Draws the app's mark — a cream paper tag with a serif "?" hanging on its string, on the night sky — for every place
// that shows it, and writes:
//   app/src/main/res/drawable/ic_launcher_background.xml         the adaptive icon's sky (vector, every density)
//   app/src/main/res/mipmap-*dpi/ic_launcher_foreground.png      the tag (also the watch app's icon: wear/build.gradle.kts)
//   app/src/main/res/mipmap-*dpi/ic_launcher_monochrome.png      the tag as a silhouette, for themed icons
//   web/icons/favicon.svg, icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png
//   store/play/graphics/icon-512.png                              Google Play's app icon (full square: Play rounds it)
//   web/index.html  the header logo (between <div class="logo"> and its <span>)
// Run from the repository root after changing the mark (needs the tests' Playwright and Python's Pillow):
//   node tools/icons.js
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const { chromium } = require(require.resolve("playwright", { paths: [path.join(ROOT, "tests")] }));

// "?" from Instrument Serif Italic (SIL Open Font License: store/play/fonts/OFL-InstrumentSerif.txt), font units, y up;
// its box is x 48..387, y -9..751.
const Q = "M128 186Q124 186 120.5 190.0Q117 194 119 204L152 370Q157 397 165.5 414.0Q174 431 195 446L225 468Q278 506 306.5 550.5Q335 595 335 656Q335 685 320.0 701.0Q305 717 282 717Q243 717 214.0 688.5Q185 660 146 590Q139 577 130 578Q119 580 124 597L154 716Q158 729 170 736Q184 744 203.5 747.5Q223 751 246 751Q282 751 314.0 738.5Q346 726 366.5 699.5Q387 673 387 630Q387 559 350.5 504.5Q314 450 250 405L201 370Q191 363 186.0 352.5Q181 342 176 325L143 200Q139 186 128 186ZM95 -9Q74 -9 61.0 4.5Q48 18 48 38Q48 64 66.0 80.0Q84 96 104 96Q124 96 137.5 82.5Q151 69 151 49Q151 23 133.0 7.0Q115 -9 95 -9Z";

const SKY = ["#131B37", "#2C3766"];            // the app's night sky, top to bottom
const GLOW = "#9DB4FF";                        // a cool light in the top right corner
const PAPER = ["#FBF4E4", "#EADBBB"], EDGE = "#D9C9A8", RUST = "#9C4A2A", STRING = "#E9DCC0";

function question(cx, cy, h, fill, extra = "") {
  const s = h / 760;
  return `<path d="${Q}" fill="${fill}" stroke="${fill}" stroke-width="${(0.9 / s).toFixed(1)}" stroke-linejoin="round" ${extra}` +
    `transform="translate(${(cx - 217.5 * s).toFixed(3)} ${(cy + 371 * s).toFixed(3)}) scale(${s.toFixed(5)} ${(-s).toFixed(5)})"/>`;
}

// The tag in a 108 × 108 box: inside the adaptive icon's safe circle (66 across), so no launcher mask cuts it.
const W = 38, H = 48, C = 8, EY = -H / 2 + 7.5;
const BODY = `M${-W / 2 + C} ${-H / 2}H${W / 2 - C}L${W / 2} ${-H / 2 + C}V${H / 2 - 3}Q${W / 2} ${H / 2} ${W / 2 - 3} ${H / 2}` +
  `H${-W / 2 + 3}Q${-W / 2} ${H / 2} ${-W / 2} ${H / 2 - 3}V${-H / 2 + C}Z`;
const STRING_UP = `M0 ${EY}C-2 ${EY - 14} 6 ${EY - 24} 3 ${EY - 50}`;
const PLACE = "translate(54 56) rotate(-9)";

function tag(id, k = 1) {
  const at = k === 1 ? PLACE : `translate(54 54) scale(${k}) translate(-54 -54) ${PLACE}`;
  return `<g transform="${at}">
<path d="${STRING_UP}" fill="none" stroke="${STRING}" stroke-width="1.6" stroke-linecap="round"/>
<path d="${BODY}" fill="#0A0804" fill-opacity=".35" transform="translate(1.2 2.4)" filter="url(#${id}b)"/>
<path d="${BODY}" fill="url(#${id}p)"/>
<path d="${BODY}" fill="none" stroke="${EDGE}" stroke-width=".8"/>
<path d="M${-W / 2 + 3.2} ${-H / 2 + C + 1}V${H / 2 - 3.4}H${W / 2 - 3.2}V${-H / 2 + C + 1}" fill="none" stroke="${EDGE}" stroke-width=".6" stroke-dasharray="1.6 1.4"/>
<circle cx="0" cy="${EY}" r="3.6" fill="${EDGE}"/><circle cx="0" cy="${EY}" r="2.3" fill="${SKY[0]}"/>
<path d="M0 ${EY}C-1.2 ${EY - 5} 1 ${EY - 9} 2 ${EY - 13}" fill="none" stroke="${STRING}" stroke-width="1.6" stroke-linecap="round"/>
${question(0, 5, 28, RUST)}
</g>`;
}

function defs(id) {
  return `<defs><filter id="${id}b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>
<linearGradient id="${id}p" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${PAPER[0]}"/><stop offset="1" stop-color="${PAPER[1]}"/></linearGradient>
<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKY[0]}"/><stop offset="1" stop-color="${SKY[1]}"/></linearGradient>
<radialGradient id="${id}g" cx="0.85" cy="0.05" r="0.9"><stop offset="0" stop-color="${GLOW}" stop-opacity=".35"/><stop offset="1" stop-color="${GLOW}" stop-opacity="0"/></radialGradient></defs>`;
}

const sky = (id) => `<rect width="108" height="108" fill="url(#${id}s)"/><rect width="108" height="108" fill="url(#${id}g)"/>`;

// The whole mark on a rounded square, the tag a little larger (favicon, PWA "any" icons, header logo).
function badge(id, attrs = 'xmlns="http://www.w3.org/2000/svg"') {
  return `<svg ${attrs} viewBox="0 0 108 108">${defs(id)}<clipPath id="${id}c"><rect width="108" height="108" rx="24"/></clipPath>` +
    `<g clip-path="url(#${id}c)">${sky(id)}${tag(id, 1.4)}</g></svg>`;
}
const full = (id, k = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${defs(id)}${sky(id)}${tag(id, k)}</svg>`;
const foreground = (id) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${defs(id)}${tag(id)}</svg>`;
// Themed icons: the system tints this; the hole and the "?" are cut out of the tag.
const monochrome = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><mask id="m"><rect width="108" height="108" fill="#fff"/>
<g transform="${PLACE}"><circle cx="0" cy="${EY}" r="2.6" fill="#000"/>${question(0, 5, 28, "#000")}</g></mask>
<g transform="${PLACE}"><path d="${STRING_UP}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g>
<g mask="url(#m)"><g transform="${PLACE}"><path d="${BODY}" fill="#fff"/></g></g></svg>`;

function backgroundXml() {
  const g = GLOW.slice(1);
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by tools/icons.js: the night sky behind the app icon's tag. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient android:type="linear" android:startX="0" android:startY="0" android:endX="0" android:endY="108">
                <item android:offset="0" android:color="#FF${SKY[0].slice(1)}" />
                <item android:offset="1" android:color="#FF${SKY[1].slice(1)}" />
            </gradient>
        </aapt:attr>
    </path>
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient android:type="radial" android:centerX="91.8" android:centerY="5.4" android:gradientRadius="97.2">
                <item android:offset="0" android:color="#59${g}" />
                <item android:offset="1" android:color="#00${g}" />
            </gradient>
        </aapt:attr>
    </path>
</vector>
`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  async function png(svg, px, out, opaque = false) {
    await page.setViewportSize({ width: px, height: px });
    await page.setContent(`<html><body style="margin:0;background:${opaque ? SKY[0] : "transparent"}">` +
      svg.replace("<svg ", `<svg width="${px}" height="${px}" style="display:block" `) + "</body></html>");
    await page.screenshot({ path: out, omitBackground: !opaque, clip: { x: 0, y: 0, width: px, height: px } });
  }
  const res = path.join(ROOT, "app/src/main/res");
  for (const [d, px] of [["mdpi", 108], ["hdpi", 162], ["xhdpi", 216], ["xxhdpi", 324], ["xxxhdpi", 432]]) {
    await png(foreground("f"), px, path.join(res, `mipmap-${d}/ic_launcher_foreground.png`));
    await png(monochrome(), px, path.join(res, `mipmap-${d}/ic_launcher_monochrome.png`));
  }
  fs.writeFileSync(path.join(res, "drawable/ic_launcher_background.xml"), backgroundXml());

  const icons = path.join(ROOT, "web/icons");
  fs.writeFileSync(path.join(icons, "favicon.svg"), badge("i") + "\n");
  await png(badge("i"), 192, path.join(icons, "icon-192.png"));
  await png(badge("i"), 512, path.join(icons, "icon-512.png"));
  await png(full("i", 1.2), 512, path.join(icons, "maskable-512.png"), true);   // the whole square: the system masks it
  await png(full("i", 1.3), 180, path.join(icons, "apple-touch-icon.png"), true);
  const play = path.join(ROOT, "store/play/graphics/icon-512.png");
  await png(full("i", 1.3), 512, play, true);
  // Play asks for a 32-bit PNG: the same picture with an (opaque) alpha channel, via Python's Pillow.
  const r = require("child_process").spawnSync("python3", ["-c", "import sys; from PIL import Image; Image.open(sys.argv[1]).convert('RGBA').save(sys.argv[1])", play]);
  if (r.status !== 0) throw new Error("icon-512 RGBA: " + r.stderr);
  await browser.close();

  // The header logo (also drawn on the share picture), with its own ids.
  const file = path.join(ROOT, "web/index.html"), html = fs.readFileSync(file, "utf8");
  const re = /(<div class="logo">\s*)<svg[\s\S]*?<\/svg>/;
  if (!re.test(html)) throw new Error('the header logo (<div class="logo"><svg …>) is not in web/index.html');
  fs.writeFileSync(file, html.replace(re, (m, a) => a + badge("ngl", 'aria-hidden="true"').replace(/\n/g, "")));
  console.log("app icon, themed icon, web icons and header logo written");
})().catch((e) => { console.error(e); process.exit(1); });
