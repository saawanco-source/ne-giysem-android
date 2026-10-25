"""Draws pictures of the watch face (same layout as build_face.py) for the picker preview and the store.

These are mock-ups in a browser: the watch draws the real face with its own font, so small differences are normal.

    python3 watchface/tools/preview.py [out_dir]

Writes watchface/src/main/res/drawable-nodpi/preview.png (English) and drawable-tr-nodpi/preview.png (Turkish);
with out_dir, also one picture per sample state there (store screenshots, checks).
"""
import asyncio
import base64
import pathlib
import sys

from playwright.async_api import async_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import build_face as F  # noqa: E402

ROOT = F.ROOT
STICKERS = ROOT / "watchface/src/main/res/drawable-nodpi"


def css(c):
    """#AARRGGBB -> rgba()."""
    c = c.lstrip("#")
    a, r, g, b = (int(c[i:i + 2], 16) for i in (0, 2, 4, 6))
    return f"rgba({r},{g},{b},{a / 255:.3f})"


def img(name):
    return "data:image/png;base64," + base64.b64encode((STICKERS / f"wf_{name}.png").read_bytes()).decode()


def page(lang, level, temp, state="", time="10:08", day="Paz 26" , ambient=False):
    t = F.TEXT[lang]
    base = F.STICKERS[level]
    names = {"snow": F.snow_stickers(base), "rain": base[:2] + ["semsiye"],
             "later": base[:2] + ["semsiye"]}.get(state, base)
    head = {"snow": t["head_snow"], "rain": t["head_rain"], "later": t["head_rain_later"]}.get(state, t["head"][level])
    color = css(F.COLORS[level])
    hide = "display:none" if ambient else ""
    stick = "".join(
        f'<img src="{img(n)}" style="position:absolute;left:{x}px;top:{F.STICKER_Y}px;width:{F.STICKER}px;height:{F.STICKER}px;{hide}">'
        for n, x in zip(names, F.STICKER_X))
    weight = 200 if ambient else 700
    cx, cy, cw, ch = F.CHIP
    hx, hy, hw, hh, hs = F.HEAD
    return f"""<html><head><style>
body{{margin:0;background:#000;font-family:'Roboto','Noto Sans','DejaVu Sans',sans-serif}}
.face{{position:relative;width:450px;height:450px;border-radius:50%;overflow:hidden;background:{css(F.BG) if not ambient else '#000'}}}
.t{{position:absolute;white-space:nowrap;overflow:hidden;display:flex;align-items:center}}
</style></head><body><div class="face">
<div style="position:absolute;left:5px;top:5px;width:426px;height:426px;border-radius:50%;border:7px solid {color};{hide}"></div>
<div class="t" style="left:75px;top:48px;width:300px;height:36px;justify-content:center;font-size:26px;color:rgba(255,255,255,.7)">{day}</div>
<div class="t" style="left:80px;top:88px;width:140px;height:50px;justify-content:flex-end;font-size:40px;font-weight:700;color:#fff">{temp}°</div>
<div style="position:absolute;left:{cx}px;top:{cy}px;width:{cw}px;height:{ch}px;border-radius:{ch // 2}px;background:{color};{hide}"></div>
<div class="t" style="left:{cx + 6}px;top:{cy + 4}px;width:{cw - 12}px;height:{ch - 8}px;justify-content:center;font-size:22px;font-weight:700;color:{css(F.INK)};{hide}">{t['lvl'][level]}</div>
<div class="t" style="left:0;top:140px;width:450px;height:124px;justify-content:center;font-size:118px;font-weight:{weight};color:#fff;letter-spacing:-2px">{time}</div>
{stick}
<div class="t" style="left:{hx}px;top:{hy}px;width:{hw}px;height:{hh}px;justify-content:center;font-size:{hs}px;font-weight:700;color:#fff;{hide}">{head}</div>
</div></body></html>"""


SAMPLES = [
    ("serin", "tr", 4, 15, ""), ("soguk-yagmur", "tr", 2, 6, "rain"), ("sicak-sonra-yagmur", "tr", 6, 24, "later"),
    ("cok-soguk-kar", "tr", 1, 0, "snow"), ("cok-sicak", "tr", 7, 31, ""), ("cool-en", "en", 4, 15, ""),
]


async def main(out_dir):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 450, "height": 450}, device_scale_factor=1)

        async def shot(html, path):
            await pg.set_content(html)
            await pg.screenshot(path=str(path), omit_background=False)

        for lang, folder, day in (("en", "drawable-nodpi", "Sun 26"), ("tr", "drawable-tr-nodpi", "Paz 26")):
            d = ROOT / "watchface/src/main/res" / folder
            d.mkdir(parents=True, exist_ok=True)
            await shot(page(lang, 4, 15, day=day), d / "preview.png")
        if out_dir:
            out = pathlib.Path(out_dir)
            out.mkdir(parents=True, exist_ok=True)
            for name, lang, level, temp, state in SAMPLES:
                await shot(page(lang, level, temp, state, day="Sun 26" if lang == "en" else "Paz 26"), out / f"{name}.png")
            await shot(page("tr", 4, 15, ambient=True), out / "ambient.png")
        await b.close()


asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else None))
