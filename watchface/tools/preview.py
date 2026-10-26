"""Draws pictures of the watch face (same layout as build_face.py) for the picker preview and the store.

These are mock-ups in a browser: the watch draws the real face with its own font, so small differences are normal.
The four small slots show sample complications (steps, battery, sunrise, next event); "card" pictures show the
outfit card the Ne Giysem? watch app puts over the weather-based outfit (wear/: Art.card).

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


ICONS = {  # small white line icons for the sample complications
    "steps": '<path d="M7 14c-1.5-4 0-9 3-9s3 5 1 9zM14 19c-1-3 .5-7 3-7s2.5 4 1 7z" fill="none" stroke="#fff" stroke-width="2"/>',
    "battery": '<rect x="5" y="7" width="13" height="10" rx="2" fill="none" stroke="#fff" stroke-width="2"/><path d="M20 10v4" stroke="#fff" stroke-width="2"/>',
    "sun": '<circle cx="12" cy="14" r="4" fill="none" stroke="#fff" stroke-width="2"/><path d="M12 4v3M4 14h2M18 14h2M6 8l2 2M18 8l-2 2M3 19h18" stroke="#fff" stroke-width="2"/>',
    "cal": '<rect x="4" y="6" width="16" height="14" rx="2" fill="none" stroke="#fff" stroke-width="2"/><path d="M4 10h16M8 3v4M16 3v4" stroke="#fff" stroke-width="2"/>',
}
SAMPLE_SLOTS = {"left": ("steps", "6.4K", "", None), "right": ("battery", "72%", "", 0.72),
                "bottom_left": ("sun", "17:58", "", None), "bottom_right": ("cal", "14:00", "", None)}


def slot_html(name, x, y, ambient):
    icon, value, title, ring = SAMPLE_SLOTS[name]
    s = F.SLOT
    bg = "" if ambient else f"background:{css(F.SLOT_BG)};"
    arc = ""
    if ring is not None and not ambient:
        r = (s - 6) / 2
        circ = 2 * 3.14159 * r
        arc = (f'<svg width="{s}" height="{s}" style="position:absolute;left:0;top:0">'
               f'<circle cx="{s/2}" cy="{s/2}" r="{r}" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="4"/>'
               f'<circle cx="{s/2}" cy="{s/2}" r="{r}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" '
               f'stroke-dasharray="{circ * ring} {circ}" transform="rotate(-90 {s/2} {s/2})"/></svg>')
    top_icon = 11 if ring is not None else 7
    top_text = 31 if ring is not None else 28
    return (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{s}px;height:{s}px;border-radius:50%;{bg}">{arc}'
            f'<svg viewBox="0 0 24 24" width="22" height="22" style="position:absolute;left:{(s - 22) // 2}px;top:{top_icon}px">{ICONS[icon]}</svg>'
            f'<div style="position:absolute;left:4px;top:{top_text}px;width:{s - 8}px;text-align:center;font-size:16px;font-weight:700;color:#fff">{value}</div></div>')


def card_html(lang, level, temp, names, head, warn=None):
    """The watch app's outfit card (wear/: Art.card) as it sits in the card slot, with the face's own sizes."""
    x, y, w, h = F.CARD
    t = F.TEXT[lang]
    pill_bg = css(F.COLORS[level]) if not warn else ("#ff8a5b" if warn[0] == 2 else "#ffe27a")
    pill_ink = css(F.INK) if not warn else ("#2a0c00" if warn[0] == 2 else "#2a2100")
    pill = t["lvl"][level] if not warn else "⚠ " + warn[1]
    stick = "".join(f'<img src="{img(n)}" style="position:absolute;left:{w / 2 + (i - 1) * 88 - 35:.0f}px;top:50px;width:70px;height:70px">'
                    for i, n in enumerate(names))
    return (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;border-radius:24px;background:{css(F.BG)};overflow:hidden">'
            f'<div style="position:absolute;left:0;top:0;width:{w}px;height:48px;display:flex;justify-content:center;align-items:center;gap:10px">'
            f'<span style="font-size:38px;font-weight:700;color:#fff">{temp}°</span>'
            f'<span style="background:{pill_bg};color:{pill_ink};border-radius:18px;height:36px;line-height:36px;padding:0 12px;font-size:20px;font-weight:700;white-space:nowrap">{pill}</span></div>'
            f'{stick}<div style="position:absolute;left:4px;top:128px;width:{w - 8}px;text-align:center;font-size:20px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{head}</div></div>')


def page(lang, level, temp, state="", time="10:08", day="Paz 26", ambient=False, card=None):
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
    dx, dy, dw, dh, ds = F.DATE
    tx, ty, tw, th, ts = F.TEMP
    cy, ch, cs = F.CLOCK
    px, py, pw, ph = F.CHIP
    hx, hy, hw, hh, hs = F.HEAD
    slots = "".join(slot_html(n, x, y, ambient) for _, n, x, y, _, _ in F.SLOTS)
    over = card_html(*card) if card and not ambient else ""
    return f"""<html><head><style>
body{{margin:0;background:#000;font-family:'Roboto','Noto Sans','DejaVu Sans',sans-serif}}
.face{{position:relative;width:450px;height:450px;border-radius:50%;overflow:hidden;background:{css(F.BG) if not ambient else '#000'}}}
.t{{position:absolute;white-space:nowrap;overflow:hidden;display:flex;align-items:center}}
</style></head><body><div class="face">
<div style="position:absolute;left:4px;top:4px;width:436px;height:436px;border-radius:50%;border:3px solid rgba(255,255,255,.15);{hide}"></div>
<div class="t" style="left:{dx}px;top:{dy}px;width:{dw}px;height:{dh}px;justify-content:center;font-size:{ds}px;color:rgba(255,255,255,.7)">{day}</div>
<div class="t" style="left:0;top:{cy}px;width:450px;height:{ch}px;justify-content:center;font-size:{cs}px;font-weight:{weight};color:#fff;letter-spacing:-2px">{time}</div>
<div class="t" style="left:{tx}px;top:{ty}px;width:{tw}px;height:{th}px;justify-content:flex-end;font-size:{ts}px;font-weight:700;color:#fff">{temp}°</div>
<div style="position:absolute;left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;border-radius:{ph // 2}px;background:{color};{hide}"></div>
<div class="t" style="left:{px + 6}px;top:{py + 4}px;width:{pw - 12}px;height:{ph - 8}px;justify-content:center;font-size:20px;font-weight:700;color:{css(F.INK)};{hide}">{t['lvl'][level]}</div>
{stick}
<div class="t" style="left:{hx}px;top:{hy}px;width:{hw}px;height:{hh}px;justify-content:center;font-size:{hs}px;font-weight:700;color:#fff;{hide}">{head}</div>
{over}{slots}
</div></body></html>"""


SAMPLES = [
    ("serin", "tr", 4, 15, "", None), ("soguk-yagmur", "tr", 2, 6, "rain", None), ("sicak-sonra-yagmur", "tr", 6, 24, "later", None),
    ("cok-soguk-kar", "tr", 1, 0, "snow", None), ("cok-sicak", "tr", 7, 31, "", None), ("cool-en", "en", 4, 15, "", None),
    ("telefondan-kart", "tr", 4, 15, "", ("tr", 3, 11, ["kazak", "mont", "jean"], "Kazak üstüne mont, atkı al.")),
    ("telefondan-uyari", "tr", 5, 19, "", ("tr", 5, 19, ["tshirt", "jean", "semsiye"], "Kapüşonlu yağmurluğunu giy.", (2, "Fırtına"))),
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
            for name, lang, level, temp, state, card in SAMPLES:
                if card and len(card) == 5:
                    card = card + (None,)
                await shot(page(lang, level, temp, state, day="Sun 26" if lang == "en" else "Paz 26", card=card), out / f"{name}.png")
            await shot(page("tr", 4, 15, ambient=True), out / "ambient.png")
        await b.close()


asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else None))
