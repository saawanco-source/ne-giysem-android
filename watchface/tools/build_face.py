"""Writes the Ne Giysem? watch face (Watch Face Format, version 2) and its texts.

The face needs no app: it reads the watch's own weather ([WEATHER.*], Wear OS 5+) and picks the outfit with
the same temperature bands as the phone app (app/src/main/java/com/negiysem/app/data/Outfit.kt, LEVEL_MIN).
The phone app uses the "feels like" temperature; the watch only has the measured one, so near a band edge
the two can differ by one level.

Outputs (run from the repository root):
    watchface/src/main/res/raw/watchface.xml
    watchface/src/main/res/values/strings.xml      (English, the default)
    watchface/src/main/res/values-tr/strings.xml   (Turkish)

    python3 watchface/tools/build_face.py
"""
import pathlib
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
RES = ROOT / "watchface/src/main/res"

# Same bands and colours as the app (Outfit.kt: LEVEL_MIN, LEVEL_COLORS, LEVEL_NAMES).
BANDS = [None, -3, 3, 8, 13, 17, 21, 26]
COLORS = ["#FF86AEFF", "#FF9CCBF7", "#FF86D6C6", "#FFAEDD8E", "#FFE6E86E", "#FFFFD65E", "#FFFFAD62", "#FFFF8270"]
INK = "#FF14161F"
BG = "#FF0B0D16"

# Three stickers per level: what to wear (and, for mild levels, the layer to carry), from the app's OUT table.
STICKERS = [
    ["parka", "bere", "eldiven"],
    ["sisme", "bere", "bot"],
    ["kaban", "atki", "bot"],
    ["kazak", "mont", "sneaker"],
    ["sweatshirt", "ceket", "sneaker"],
    ["tshirt", "hirka", "jean"],
    ["tshirt", "jean", "sneaker"],
    ["tshirt", "sort", "sapka"],
]

TEXT = {
    "en": {
        "watch_face_name": "Ne Giysem?",
        "lvl": ["Freezing", "Very cold", "Cold", "Chilly", "Cool", "Mild", "Warm", "Hot"],
        "head": ["Layer up, parka on", "Puffer and beanie", "Coat and scarf time", "Jumper and jacket",
                 "Sweatshirt + light jacket", "T-shirt, bring a cardigan", "T-shirt weather", "Lightest clothes today"],
        "head_rain": "Raining: take an umbrella",
        "head_rain_later": "Take your umbrella",
        "head_snow": "Snow: wear boots",
        "no_weather": "Waiting for weather",
    },
    "tr": {
        "watch_face_name": "Ne Giysem?",
        "lvl": ["Dondurucu", "Çok soğuk", "Soğuk", "Soğukça", "Serin", "Ilık", "Sıcak", "Çok sıcak"],
        "head": ["Kat kat giy, parka şart", "Şişme mont ve bere", "Kaban ve atkı zamanı", "Kazak üstüne mont",
                 "Sweatshirt + ince ceket", "Tişört, yanına hırka", "Bugün tişört havası", "En hafif kıyafetler"],
        "head_rain": "Yağmur var, şemsiye al",
        "head_rain_later": "Şemsiyeni yanına al",
        "head_snow": "Kar var, bot giy",
        "no_weather": "Hava bilgisi bekleniyor",
    },
}

# Temperature in °C whatever unit the watch shows.
CELSIUS = "([WEATHER.TEMPERATURE_UNIT] == 2 ? ([WEATHER.TEMPERATURE] - 32) / 1.8 : [WEATHER.TEMPERATURE])"
COND = "[WEATHER.CONDITION]"
SNOW_NOW = f"({COND} == 5 || {COND} == 7 || {COND} == 11)"
RAIN_NOW = f"({COND} == 4 || {COND} == 6 || {COND} == 9 || {COND} == 10 || {COND} == 12)"
RAIN_LATER = f"(([WEATHER.CHANCE_OF_PRECIPITATION] >= 50) && !{RAIN_NOW} && !{SNOW_NOW})"

# Layout on the 450 x 450 face (scaled to the watch).
STICKER = 78
STICKER_Y = 266
STICKER_X = [225 - STICKER // 2 - 96, 225 - STICKER // 2, 225 - STICKER // 2 + 96]
CHIP = (226, 94, 150, 40)          # x, y, width, height of the level-name pill
HEAD = (60, 348, 330, 34, 22)      # x, y, width, height, font size of the headline (inside the ring at that height)


def el(parent, tag, **attrs):
    e = ET.SubElement(parent, tag)
    for k, v in attrs.items():
        e.set(k.rstrip("_"), str(v))
    return e


def hide_in_ambient(e):
    el(e, "Variant", mode="AMBIENT", target="alpha", value="0")


def text(parent, name, x, y, w, h, size, color, weight="NORMAL", align="CENTER", template="%s", params=(), ambient=True):
    pt = el(parent, "PartText", name=name, x=x, y=y, width=w, height=h)
    if not ambient:
        hide_in_ambient(pt)
    t = el(pt, "Text", align=align, maxLines=1, ellipsis="TRUE")
    f = el(t, "Font", family="SYNC_TO_DEVICE", size=size, weight=weight, color=color)
    tp = el(f, "Template")
    tp.text = template
    for p in params:
        el(tp, "Parameter", expression=p)
    return pt


def condition(parent, branches, default=None):
    """branches: [(name, expression, fill(group))]; default: fill(group) or None."""
    c = el(parent, "Condition")
    ex = el(c, "Expressions")
    for name, expr, _ in branches:
        e = el(ex, "Expression", name=name)
        e.text = expr
    for name, _, fill in branches:
        fill(el(el(c, "Compare", expression=name), "Group", name=f"{name}_g", x=0, y=0, width=450, height=450))
    if default:
        fill_default = el(el(c, "Default"), "Group", name="default_g", x=0, y=0, width=450, height=450)
        default(fill_default)
    return c


def stickers(g, names, tag):
    for i, n in enumerate(names):
        pi = el(g, "PartImage", name=f"{tag}_s{i}", x=STICKER_X[i], y=STICKER_Y, width=STICKER, height=STICKER)
        hide_in_ambient(pi)
        el(pi, "Image", resource=f"wf_{n}")


def headline(g, string_name, tag):
    x, y, w, h, size = HEAD
    text(g, f"{tag}_head", x, y, w, h, size, "#FFFFFFFF", weight="BOLD", params=[string_name], ambient=False)


def snow_stickers(base):
    """Snow: boots always show (the third sticker becomes boots, or gloves when boots are already there)."""
    return base[:2] + (["eldiven"] if "bot" in base[:2] else ["bot"])


def level_group(i):
    color = COLORS[i]

    def fill(g):
        # Level colour ring around the edge.
        ring = el(g, "PartDraw", name=f"l{i}_ring", x=0, y=0, width=450, height=450)
        hide_in_ambient(ring)
        el(el(ring, "Ellipse", x=5, y=5, width=440, height=440), "Stroke", color=color, thickness=7)
        # Level name chip next to the temperature.
        cx, cy, cw, ch = CHIP
        chip = el(g, "Group", name=f"l{i}_chip", x=cx, y=cy, width=cw, height=ch)
        hide_in_ambient(chip)
        pill = el(chip, "PartDraw", name=f"l{i}_pill", x=0, y=0, width=cw, height=ch)
        el(el(pill, "RoundRectangle", x=0, y=0, width=cw, height=ch, cornerRadiusX=ch // 2, cornerRadiusY=ch // 2), "Fill", color=color)
        text(chip, f"l{i}_name", 6, 4, cw - 12, ch - 8, 22, INK, weight="BOLD", params=[f"lvl_{i}"])
        # Stickers and headline: snow, rain now, rain later today, or the level's own.
        base = STICKERS[i]
        snow = snow_stickers(base)
        wet = base[:2] + ["semsiye"]

        def make(names, head, tag):
            def f(gg):
                stickers(gg, names, tag)
                headline(gg, head, tag)
            return f

        condition(g, [
            (f"l{i}_snow", SNOW_NOW, make(snow, "head_snow", f"l{i}sn")),
            (f"l{i}_rain", RAIN_NOW, make(wet, "head_rain", f"l{i}rn")),
            (f"l{i}_later", RAIN_LATER, make(wet, "head_rain_later", f"l{i}rl")),
        ], default=make(base, f"head_{i}", f"l{i}d"))

    lo, hi = BANDS[i], BANDS[i + 1] if i + 1 < len(BANDS) else None
    # Parentheses everywhere: the format documents no precedence between comparison and logical operators.
    parts = ([f"({CELSIUS} >= {lo})"] if lo is not None else []) + ([f"({CELSIUS} < {hi})"] if hi is not None else [])
    return (f"lv{i}", " && ".join(parts), fill)


def build():
    wf = ET.Element("WatchFace", width="450", height="450")
    el(wf, "Metadata", key="CLOCK_TYPE", value="DIGITAL")
    el(wf, "Metadata", key="PREVIEW_TIME", value="10:08:32")
    scene = el(wf, "Scene", backgroundColor=BG)

    weather = el(scene, "Group", name="weather", x=0, y=0, width=450, height=450)

    def available(g):
        # Temperature as the watch shows it (°C or °F), kept in ambient mode.
        text(g, "temp", 80, 88, 140, 50, 40, "#FFFFFFFF", weight="BOLD", align="END", template="%s°",
             params=["[WEATHER.TEMPERATURE]"])
        condition(g, [level_group(i) for i in range(8)])

    def missing(g):
        text(g, "no_weather", 50, 300, 350, 40, 24, "#B3FFFFFF", params=["no_weather"], ambient=False)

    condition(weather, [("has_weather", "[WEATHER.IS_AVAILABLE]", available)], default=missing)

    # Day and date.
    date = text(scene, "date", 75, 48, 300, 36, 26, "#B3FFFFFF", template="%s %s", params=["[DAY_OF_WEEK_S]", "[DAY]"])
    el(date, "Localization", calendar="GREGORIAN", timeZone="SYNC_TO_DEVICE")
    date.insert(0, date[-1])
    date.remove(date[-1])

    # The time: bold when active, thin in ambient mode.
    clock = el(scene, "DigitalClock", x=0, y=140, width=450, height=124)
    for weight, alpha, ambient_alpha in (("BOLD", 255, 0), ("THIN", 0, 255)):
        tt = el(clock, "TimeText", format="hh:mm", hourFormat="SYNC_TO_DEVICE", align="CENTER",
                x=0, y=0, width=450, height=124, alpha=alpha)
        el(tt, "Variant", mode="AMBIENT", target="alpha", value=ambient_alpha)
        el(tt, "Font", family="SYNC_TO_DEVICE", size=118, weight=weight, color="#FFFFFFFF")

    ET.indent(wf, space="  ")
    return ET.tostring(wf, encoding="unicode")


def strings(lang):
    t = TEXT[lang]
    r = ET.Element("resources")

    def s(name, value):
        e = ET.SubElement(r, "string", name=name)
        e.text = value.replace("'", "\\'")

    s("watch_face_name", t["watch_face_name"])
    for i in range(8):
        s(f"lvl_{i}", t["lvl"][i])
        s(f"head_{i}", t["head"][i])
    for k in ("head_rain", "head_rain_later", "head_snow", "no_weather"):
        s(k, t[k])
    ET.indent(r, space="  ")
    return '<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated by watchface/tools/build_face.py -->\n' + ET.tostring(r, encoding="unicode") + "\n"


if __name__ == "__main__":
    (RES / "raw").mkdir(parents=True, exist_ok=True)
    (RES / "raw/watchface.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated by watchface/tools/build_face.py; edit that file, not this one. -->\n'
        + build() + "\n", encoding="utf-8")
    for lang, folder in (("en", "values"), ("tr", "values-tr")):
        (RES / folder).mkdir(parents=True, exist_ok=True)
        (RES / folder / "strings.xml").write_text(strings(lang), encoding="utf-8")
    print("watchface.xml:", (RES / "raw/watchface.xml").stat().st_size, "bytes")
