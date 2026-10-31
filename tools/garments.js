// Draws the app's garments (the ART drawings in web/index.html) as pictures, for the places that can't draw SVG:
//   app/src/main/res/drawable-nodpi/g_<name>.webp     the home-screen widget and the watch app (copied at build time)
//   watchface/src/main/res/drawable-nodpi/wf_<name>.png  the watch face (Watch Face Format draws bitmaps)
// Each picture has the drawing's soft shadow, as on the app screen. Run from the repository root after changing a
// drawing (needs the tests' Playwright and Python's Pillow):
//   node tools/garments.js
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const { chromium } = require(require.resolve("playwright", { paths: [path.join(ROOT, "tests")] }));

const APP = path.join(ROOT, "app/src/main/res/drawable-nodpi");
const FACE = path.join(ROOT, "watchface/src/main/res/drawable-nodpi");
const APP_PX = 288;  // widget stickers reach about 80 dp; the watch app draws them at 105 px
const FACE_PX = 96;  // drawn at up to 84 units on the 450-unit face
// The ones the watch face uses (watchface/tools/build_face.py, STICKERS).
const FACE_NAMES = ["parka", "bere", "eldiven", "sisme", "bot", "kaban", "atki", "kazak", "mont", "sneaker", "sweatshirt",
  "ceket", "tshirt", "hirka", "jean", "sort", "sapka", "semsiye"];

function garmentCode() {
  const src = fs.readFileSync(path.join(ROOT, "web/index.html"), "utf8");
  const a = src.indexOf("  /* ================= garments: fabric"), b = src.indexOf("  var G = {tshirt", a);
  if (a < 0 || b < 0) throw new Error("the garment drawings (garments: fabric … var G) are not in web/index.html");
  return 'var BOTTOMS = ["jean","pantolon","sort","tayt"], SHOES = ["sneaker","spor","bot","yuruyus","sandalet"];\n' + src.slice(a, b);
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "garments-"));
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent('<!doctype html><html><body style="margin:0;background:transparent"><div id="d"></div></body></html>');
  await page.addScriptTag({ content: garmentCode() + "\nwindow.ART = ART; window.art = art;" });
  const names = await page.evaluate(() => Object.keys(window.ART));
  for (const [dir, px, list, ext] of [[APP, APP_PX, names, "webp"], [FACE, FACE_PX, FACE_NAMES, "png"]]) {
    for (const g of list) {
      // the drawing at 88 % with its shadow below, like .stk .art on the page
      await page.evaluate(({ g, px }) => {
        const pad = Math.round(px * 0.06);
        document.getElementById("d").innerHTML = '<div id="b" style="width:' + px + 'px;height:' + px + 'px;box-sizing:border-box;padding:' + pad + 'px ' + pad + 'px ' + (pad * 2) + 'px">' +
          '<div style="width:100%;height:100%;filter:drop-shadow(0 ' + (px * 0.045).toFixed(1) + 'px ' + (px * 0.035).toFixed(1) + 'px rgba(30,24,10,.32))">' +
          window.art(g).replace("<svg ", '<svg width="100%" height="100%" ') + "</div></div>";
      }, { g, px });
      const png = path.join(tmp, (ext === "png" ? "wf_" : "g_") + g + ".png");
      await page.locator("#b").screenshot({ path: png, omitBackground: true });
      if (ext === "png") fs.copyFileSync(png, path.join(dir, "wf_" + g + ".png"));
      else {
        const out = path.join(dir, "g_" + g + ".webp");
        const r = spawnSync("python3", ["-c", "import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], 'WEBP', quality=88, method=6)", png, out]);
        if (r.status !== 0) throw new Error("WebP: " + r.stderr);
      }
    }
    console.log(list.length + " pictures → " + path.relative(ROOT, dir));
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
