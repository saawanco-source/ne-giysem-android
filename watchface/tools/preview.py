"""Draws pictures of the watch face (same layout as build_face.py) for the picker preview and the store.

These are mock-ups in a browser (with the face's own serif, res/font): small differences from the watch are normal.
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
SERIF_TTF = ROOT / f"watchface/src/main/res/font/{F.SERIF}.ttf"


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


def sky(left=0, top=0):
    """The face's sky (build_face.py: SKY, GLOW), placed as it is at (left, top) of the face."""
    a, b, c = (css(x) for x in F.SKY)
    g0, g1 = (css(x) for x in F.GLOW)
    return (f"background:radial-gradient(circle 300px at 370px 20px,{g0},{g1}),linear-gradient(180deg,{a} 0,{b} 45%,{c} 100%);"
            f"background-size:450px 450px;background-position:{-left}px {-top}px;background-repeat:no-repeat")


def slot_html(name, x, y, ambient):
    icon, value, title, ring = SAMPLE_SLOTS[name]
    s = F.SLOT
    bg = "" if ambient else f"background:{css(F.SLOT_BG)};box-shadow:inset 0 0 0 1px {css(F.SLOT_EDGE)};"
    arc = ""
    if ring is not None and not ambient:
        r = (s - 6) / 2
        circ = 2 * 3.14159 * r
        arc = (f'<svg width="{s}" height="{s}" style="position:absolute;left:0;top:0">'
               f'<circle cx="{s/2}" cy="{s/2}" r="{r}" fill="none" stroke="rgba(243,239,230,.25)" stroke-width="4"/>'
               f'<circle cx="{s/2}" cy="{s/2}" r="{r}" fill="none" stroke="{css(F.PAPER)}" stroke-width="4" stroke-linecap="round" '
               f'stroke-dasharray="{circ * ring} {circ}" transform="rotate(-90 {s/2} {s/2})"/></svg>')
    top_icon = 11 if ring is not None else 7
    top_text = 31 if ring is not None else 28
    return (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{s}px;height:{s}px;border-radius:50%;{bg}">{arc}'
            f'<svg viewBox="0 0 24 24" width="22" height="22" style="position:absolute;left:{(s - 22) // 2}px;top:{top_icon}px">{ICONS[icon]}</svg>'
            f'<div style="position:absolute;left:4px;top:{top_text}px;width:{s - 8}px;text-align:center;font-size:16px;font-weight:700;color:{css(F.CREAM)}">{value}</div></div>')


def card_html(lang, level, temp, names, head, warn=None):
    """The watch app's outfit card (wear/: Art.card) as it sits in the card slot, with the face's own sizes."""
    x, y, w, h = F.CARD
    t = F.TEXT[lang]
    pill_bg = css(F.PAPER) if not warn else ("#ff7a1a" if warn[0] == 2 else "#f2b705")
    pill_ink = css(F.RUST) if not warn else ("#1a0b02" if warn[0] == 2 else "#1a1300")
    pill = t["lvl"][level] if not warn else "⚠ " + warn[1]
    shape = ("border-radius:18px;padding:0 12px" if warn else
             f"border-radius:6px;padding:0 10px 0 20px;background-image:radial-gradient(circle 4px at 11px 18px,{css(F.SKY[1])} 99%,transparent)")
    stick = "".join(f'<img src="{img(n)}" style="position:absolute;left:{w / 2 + (i - 1) * 88 - 35:.0f}px;top:50px;width:70px;height:70px">'
                    for i, n in enumerate(names))
    return (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;{sky(x, y)};overflow:hidden">'
            f'<div style="position:absolute;left:0;top:0;width:{w}px;height:48px;display:flex;justify-content:center;align-items:center;gap:10px">'
            f'<span style="font-family:ng-serif;font-size:42px;color:{css(F.CREAM)}">{temp}°</span>'
            f'<span style="background-color:{pill_bg};color:{pill_ink};{shape};height:36px;line-height:36px;font-size:20px;font-weight:700;white-space:nowrap">{pill}</span></div>'
            f'{stick}<div style="position:absolute;left:4px;top:124px;width:{w - 8}px;text-align:center;font-family:ng-serif;font-size:24px;color:{css(F.CREAM)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{head}</div></div>')


def page(lang, level, temp, state="", time="10:08", day="Paz 26", ambient=False, card=None):
    t = F.TEXT[lang]
    base = F.STICKERS[level]
    names = {"snow": F.snow_stickers(base), "rain": base[:2] + ["semsiye"],
             "later": base[:2] + ["semsiye"]}.get(state, base)
    head = {"snow": t["head_snow"], "rain": t["head_rain"], "later": t["head_rain_later"]}.get(state, t["head"][level])
    hide = "display:none" if ambient else ""
    stick = "".join(
        f'<img src="{img(n)}" style="position:absolute;left:{x}px;top:{F.STICKER_Y}px;width:{F.STICKER}px;height:{F.STICKER}px;{hide}">'
        for n, x in zip(names, F.STICKER_X))
    clock_color = "#bdbab3" if ambient else css(F.CREAM)
    font = base64.b64encode(SERIF_TTF.read_bytes()).decode()
    dx, dy, dw, dh, ds = F.DATE
    tx, ty, tw, th, ts = F.TEMP
    cy, ch, cs = F.CLOCK
    px, py, pw, ph = F.CHIP
    hx, hy, hw, hh, hs = F.HEAD
    slots = "".join(slot_html(n, x, y, ambient) for _, n, x, y, _, _ in F.SLOTS)
    over = card_html(*card) if card and not ambient else ""
    return f"""<html><head><style>
@font-face{{font-family:ng-serif;src:url(data:font/ttf;base64,{font})}}
body{{margin:0;background:#000;font-family:'Roboto','Noto Sans','DejaVu Sans',sans-serif}}
.face{{position:relative;width:450px;height:450px;border-radius:50%;overflow:hidden;{sky() if not ambient else 'background:#000'}}}
.t{{position:absolute;white-space:nowrap;overflow:hidden;display:flex;align-items:center}}
</style></head><body><div class="face">
<svg width="450" height="450" style="position:absolute;left:0;top:0;{hide}"><ellipse cx="225" cy="225" rx="216" ry="216" fill="none" stroke="rgba(243,239,230,.18)" stroke-width="1.5" stroke-dasharray="6 5"/></svg>
<div class="t" style="left:{dx}px;top:{dy}px;width:{dw}px;height:{dh}px;justify-content:center;font-size:{ds}px;color:{css(F.CREAM_SOFT)}">{day}</div>
<div class="t" style="left:0;top:{cy}px;width:450px;height:{ch}px;justify-content:center;font-family:ng-serif;font-size:{cs}px;color:{clock_color}">{time}</div>
<div class="t" style="left:{tx}px;top:{ty}px;width:{tw}px;height:{th}px;justify-content:flex-end;font-family:ng-serif;font-size:{ts}px;color:{css(F.CREAM)}">{temp}°</div>
<div style="position:absolute;left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;border-radius:6px;background:{css(F.PAPER)};{hide}"><div style="position:absolute;left:7px;top:{ph // 2 - 4}px;width:8px;height:8px;border-radius:50%;background:{css(F.SKY[1])}"></div></div>
<div class="t" style="left:{px + 18}px;top:{py + 4}px;width:{pw - 24}px;height:{ph - 8}px;justify-content:center;font-size:{F.CHIP_TEXT}px;font-weight:700;color:{css(F.RUST)};{hide}">{t['lvl'][level]}</div>
{stick}
<div class="t" style="left:{hx}px;top:{hy}px;width:{hw}px;height:{hh}px;justify-content:center;font-family:ng-serif;font-size:{hs}px;color:{css(F.CREAM)};{hide}">{head}</div>
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
