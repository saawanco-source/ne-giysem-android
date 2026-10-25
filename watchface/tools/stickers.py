"""Turns the app's garment stickers (Android vector drawables) into PNGs for the watch face.

Watch Face Format draws bitmaps, so each app/src/main/res/drawable/g_*.xml becomes
watchface/src/main/res/drawable-nodpi/wf_<name>.png. Run from the repository root:

    python3 watchface/tools/stickers.py
"""
import asyncio
import pathlib
import xml.etree.ElementTree as ET

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "app/src/main/res/drawable"
OUT = ROOT / "watchface/src/main/res/drawable-nodpi"
A = "{http://schemas.android.com/apk/res/android}"
SIZE = 96  # pixels; drawn at up to 84 units on a 450-unit face (Galaxy Watch 7: 432-480 px)

# The ones the watch face uses.
NAMES = ["parka", "bere", "eldiven", "sisme", "bot", "kaban", "atki", "kazak", "mont", "sneaker", "sweatshirt",
         "ceket", "tshirt", "hirka", "jean", "sort", "sapka", "semsiye"]


def argb(v):
    """#AARRGGBB -> (css color, alpha)."""
    v = v.lstrip("#")
    if len(v) == 6:
        return "#" + v, 1.0
    return "#" + v[2:], int(v[:2], 16) / 255


def to_svg(path):
    root = ET.parse(path).getroot()
    vw, vh = root.get(A + "viewportWidth"), root.get(A + "viewportHeight")

    def walk(el):
        out = []
        for c in el:
            if c.tag == "group":
                t = []
                if c.get(A + "translateX") or c.get(A + "translateY"):
                    t.append(f"translate({c.get(A + 'translateX', '0')} {c.get(A + 'translateY', '0')})")
                if c.get(A + "rotation"):
                    t.append(f"rotate({c.get(A + 'rotation')} {c.get(A + 'pivotX', '0')} {c.get(A + 'pivotY', '0')})")
                out.append(f'<g transform="{" ".join(t)}">' + walk(c) + "</g>")
            elif c.tag == "path":
                fill, fa = argb(c.get(A + "fillColor", "#00000000"))
                stroke, sa = argb(c.get(A + "strokeColor", "#00000000"))
                sa *= float(c.get(A + "strokeAlpha", "1"))
                out.append(
                    f'<path d="{c.get(A + "pathData")}" fill="{fill}" fill-opacity="{fa}" stroke="{stroke}" '
                    f'stroke-opacity="{sa}" stroke-width="{c.get(A + "strokeWidth", "0")}" '
                    f'stroke-linecap="{c.get(A + "strokeLineCap", "butt")}" stroke-linejoin="{c.get(A + "strokeLineJoin", "miter")}"/>'
                )
        return "".join(out)

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" width="{SIZE}" height="{SIZE}">{walk(root)}</svg>'


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page(viewport={"width": SIZE, "height": SIZE}, device_scale_factor=1)
        for n in NAMES:
            svg = to_svg(SRC / f"g_{n}.xml")
            await page.set_content(f'<html><body style="margin:0;background:transparent">{svg}</body></html>')
            await page.locator("svg").screenshot(path=str(OUT / f"wf_{n}.png"), omit_background=True)
        await b.close()
    print("stickers:", len(NAMES), "->", OUT.relative_to(ROOT))


asyncio.run(main())
