"""Writes the Ne Giysem? watch face (Watch Face Format, version 2) and its texts.

The face needs no app: it reads the watch's own weather ([WEATHER.*], Wear OS 5+) and picks the outfit with
the same temperature bands as the phone app (app/src/main/java/com/negiysem/app/data/Outfit.kt, LEVEL_MIN).
The phone app uses the "feels like" temperature; the watch only has the measured one, so near a band edge
the two can differ by one level.

With the Ne Giysem? watch app installed (wear/), the outfit card slot shows the phone's own recommendation instead
(its photo-image complication covers the weather-based outfit underneath). Four small slots take any complication
the person picks (steps, battery, heart rate, …).

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
        "outfit_slot": "Outfit", "slot_left": "Left", "slot_right": "Right",
        "slot_bottom_left": "Bottom left", "slot_bottom_right": "Bottom right",
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
        "outfit_slot": "Kıyafet", "slot_left": "Sol", "slot_right": "Sağ",
        "slot_bottom_left": "Sol alt", "slot_bottom_right": "Sağ alt",
    },
}

# Temperature in °C whatever unit the watch shows.
CELSIUS = "([WEATHER.TEMPERATURE_UNIT] == 2 ? ([WEATHER.TEMPERATURE] - 32) / 1.8 : [WEATHER.TEMPERATURE])"
COND = "[WEATHER.CONDITION]"
SNOW_NOW = f"({COND} == 5 || {COND} == 7 || {COND} == 11)"
RAIN_NOW = f"({COND} == 4 || {COND} == 6 || {COND} == 9 || {COND} == 10 || {COND} == 12)"
RAIN_LATER = f"(([WEATHER.CHANCE_OF_PRECIPITATION] >= 50) && !{RAIN_NOW} && !{SNOW_NOW})"

# Layout on the 450 x 450 face (scaled to the watch).
DATE = (75, 38, 300, 34, 24)        # x, y, width, height, font size
CLOCK = (72, 104, 96)               # y, height, font size
CARD = (88, 180, 274, 168)          # the outfit card: x, y, width, height (the photo-image slot, same place)
TEMP = (88, 180, 130, 46, 38)       # x, y, width, height, font size (right-aligned, before the level pill)
STICKER = 70
STICKER_Y = 230
STICKER_X = [225 - STICKER // 2 - 88, 225 - STICKER // 2, 225 - STICKER // 2 + 88]
CHIP = (226, 186, 128, 36)          # x, y, width, height of the level-name pill
HEAD = (88, 308, 274, 34, 20)       # x, y, width, height, font size of the headline
# The four small complication slots (64 px circles, inside the ring): left, right, bottom left, bottom right.
SLOT = 64
SLOTS = [
    (1, "left", 20, 232, "STEP_COUNT", "SHORT_TEXT"),
    (2, "right", 366, 232, "WATCH_BATTERY", "RANGED_VALUE"),
    (3, "bottom_left", 146, 356, "SUNRISE_SUNSET", "SHORT_TEXT"),
    (4, "bottom_right", 240, 356, "NEXT_EVENT", "SHORT_TEXT"),
]
SLOT_TYPES = ["SHORT_TEXT", "RANGED_VALUE", "GOAL_PROGRESS", "MONOCHROMATIC_IMAGE", "SMALL_IMAGE", "EMPTY"]
SLOT_BG = "#FF1C1F2B"
# The outfit card from the Ne Giysem? watch app (wear/: OutfitComplicationService, photo image).
NG_PROVIDER = "com.negiysem.app/com.negiysem.app.wear.OutfitComplicationService"


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
        # Level name chip next to the temperature. (No level-coloured ring: the phone's card can show another level
        # than the watch's own weather, and the ring is outside the card, so it would disagree with it.)
        cx, cy, cw, ch = CHIP
        chip = el(g, "Group", name=f"l{i}_chip", x=cx, y=cy, width=cw, height=ch)
        hide_in_ambient(chip)
        pill = el(chip, "PartDraw", name=f"l{i}_pill", x=0, y=0, width=cw, height=ch)
        el(el(pill, "RoundRectangle", x=0, y=0, width=cw, height=ch, cornerRadiusX=ch // 2, cornerRadiusY=ch // 2), "Fill", color=color)
        text(chip, f"l{i}_name", 6, 4, cw - 12, ch - 8, 20, INK, weight="BOLD", params=[f"lvl_{i}"])
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

    # A quiet frame around the edge (gone in ambient).
    frame = el(scene, "PartDraw", name="frame", x=0, y=0, width=450, height=450)
    hide_in_ambient(frame)
    el(el(frame, "Ellipse", x=4, y=4, width=442, height=442), "Stroke", color="#26FFFFFF", thickness=3)

    weather = el(scene, "Group", name="weather", x=0, y=0, width=450, height=450)

    def available(g):
        # Temperature as the watch shows it (°C or °F), kept in ambient mode.
        tx, ty, tw, th, ts = TEMP
        text(g, "temp", tx, ty, tw, th, ts, "#FFFFFFFF", weight="BOLD", align="END", template="%s°",
             params=["[WEATHER.TEMPERATURE]"])
        condition(g, [level_group(i) for i in range(8)])

    def missing(g):
        x, y, w, h = CARD
        text(g, "no_weather", x, y + 60, w, 40, 22, "#B3FFFFFF", params=["no_weather"], ambient=False)

    condition(weather, [("has_weather", "[WEATHER.IS_AVAILABLE]", available)], default=missing)

    # Day and date.
    dx, dy, dw, dh, ds = DATE
    date = text(scene, "date", dx, dy, dw, dh, ds, "#B3FFFFFF", template="%s %s", params=["[DAY_OF_WEEK_S]", "[DAY]"])
    el(date, "Localization", calendar="GREGORIAN", timeZone="SYNC_TO_DEVICE")
    date.insert(0, date[-1])
    date.remove(date[-1])

    # The time: bold when active, thin in ambient mode.
    cy, ch, cs = CLOCK
    clock = el(scene, "DigitalClock", x=0, y=cy, width=450, height=ch)
    for weight, alpha, ambient_alpha in (("BOLD", 255, 0), ("THIN", 0, 255)):
        tt = el(clock, "TimeText", format="hh:mm", hourFormat="SYNC_TO_DEVICE", align="CENTER",
                x=0, y=0, width=450, height=ch, alpha=alpha)
        el(tt, "Variant", mode="AMBIENT", target="alpha", value=ambient_alpha)
        el(tt, "Font", family="SYNC_TO_DEVICE", size=cs, weight=weight, color="#FFFFFFFF")

    outfit_card(scene)
    for slot in SLOTS:
        small_slot(scene, *slot)

    ET.indent(wf, space="  ")
    return ET.tostring(wf, encoding="unicode")


def outfit_card(scene):
    """The phone's outfit (Ne Giysem? watch app) over the weather-based one; nothing drawn when it has no card."""
    x, y, w, h = CARD
    cs = el(scene, "ComplicationSlot", name="outfit_card", x=x, y=y, width=w, height=h, slotId=0,
            supportedTypes="PHOTO_IMAGE EMPTY", displayName="outfit_slot", isCustomizable="TRUE")
    el(cs, "DefaultProviderPolicy", defaultSystemProvider="EMPTY", defaultSystemProviderType="EMPTY",
       primaryProvider=NG_PROVIDER, primaryProviderType="PHOTO_IMAGE")
    el(cs, "BoundingRoundBox", x=0, y=0, width=w, height=h, cornerRadius=24)
    photo = el(cs, "Complication", type="PHOTO_IMAGE")
    pi = el(photo, "PartImage", name="outfit_photo", x=0, y=0, width=w, height=h)
    el(pi, "Image", resource="[COMPLICATION.PHOTO_IMAGE]")
    el(el(cs, "Complication", type="EMPTY"), "Group", name="outfit_empty", x=0, y=0, width=w, height=h)
    # Ambient: the card goes; the weather-based temperature underneath stays.
    el(cs, "Variant", mode="AMBIENT", target="alpha", value="0")


def small_slot(scene, slot_id, name, x, y, provider, provider_type):
    """A 64 px round slot for any complication: text with icon, a progress ring, or an image."""
    s = SLOT
    cs = el(scene, "ComplicationSlot", name=f"slot_{name}", x=x, y=y, width=s, height=s, slotId=slot_id,
            supportedTypes=" ".join(SLOT_TYPES), displayName=f"slot_{name}", isCustomizable="TRUE")
    el(cs, "DefaultProviderPolicy", defaultSystemProvider=provider, defaultSystemProviderType=provider_type)
    el(cs, "BoundingOval", x=0, y=0, width=s, height=s, outlinePadding=3)

    def disc(parent, tag):
        d = el(parent, "PartDraw", name=f"{name}_{tag}_bg", x=0, y=0, width=s, height=s)
        hide_in_ambient(d)
        el(el(d, "Ellipse", x=0, y=0, width=s, height=s), "Fill", color=SLOT_BG)

    def icon(parent, tag, size, top, source="[COMPLICATION.MONOCHROMATIC_IMAGE]"):
        pi = el(parent, "PartImage", name=f"{name}_{tag}_icon", x=(s - size) // 2, y=top, width=size, height=size, tintColor="#FFFFFFFF")
        el(pi, "Image", resource=source)

    def label(parent, tag, top, h, size, source, color="#FFFFFFFF", weight="BOLD"):
        text(parent, f"{name}_{tag}", 4, top, s - 8, h, size, color, weight=weight, params=[source])

    def ring(parent, tag, value):
        d = el(parent, "PartDraw", name=f"{name}_{tag}_ring", x=0, y=0, width=s, height=s)
        hide_in_ambient(d)
        el(el(d, "Ellipse", x=3, y=3, width=s - 6, height=s - 6), "Stroke", color="#40FFFFFF", thickness=4)
        arc = el(d, "Arc", centerX=s // 2, centerY=s // 2, width=s - 6, height=s - 6, startAngle=0, endAngle=0)
        el(arc, "Stroke", color="#FFFFFFFF", thickness=4, cap="ROUND")
        el(arc, "Transform", target="endAngle", value=value)

    c = el(cs, "Complication", type="SHORT_TEXT")
    disc(c, "st")
    icon(c, "st", 22, 7)
    label(c, "st_text", 28, 20, 17, "[COMPLICATION.TEXT]")
    label(c, "st_title", 46, 14, 11, "[COMPLICATION.TITLE]", color="#B3FFFFFF", weight="NORMAL")

    for kind, v, lo, hi in (("RANGED_VALUE", "[COMPLICATION.RANGED_VALUE_VALUE]", "[COMPLICATION.RANGED_VALUE_MIN]", "[COMPLICATION.RANGED_VALUE_MAX]"),
                            ("GOAL_PROGRESS", "[COMPLICATION.GOAL_PROGRESS_VALUE]", "0", "[COMPLICATION.GOAL_PROGRESS_TARGET_VALUE]")):
        tag = "rv" if kind == "RANGED_VALUE" else "gp"
        c = el(cs, "Complication", type=kind)
        disc(c, tag)
        ring(c, tag, f"clamp(360 * ({v} - {lo}) / ({hi} - {lo} + 0.000001), 0, 360)")
        icon(c, tag, 20, 11)
        label(c, f"{tag}_text", 31, 20, 16, "[COMPLICATION.TEXT]")

    c = el(cs, "Complication", type="MONOCHROMATIC_IMAGE")
    disc(c, "mi")
    icon(c, "mi", 32, 16)

    c = el(cs, "Complication", type="SMALL_IMAGE")
    disc(c, "si")
    pi = el(c, "PartImage", name=f"{name}_si_img", x=10, y=10, width=s - 20, height=s - 20)
    hide_in_ambient(pi)
    el(pi, "Image", resource="[COMPLICATION.SMALL_IMAGE]")

    # An empty slot: a faint circle, so the place is visible (gone in ambient).
    c = el(cs, "Complication", type="EMPTY")
    d = el(c, "PartDraw", name=f"{name}_empty", x=0, y=0, width=s, height=s)
    hide_in_ambient(d)
    el(el(d, "Ellipse", x=2, y=2, width=s - 4, height=s - 4), "Stroke", color="#33FFFFFF", thickness=2)


def strings(lang):
    t = TEXT[lang]
    r = ET.Element("resources")

    def s(name, value):
        e = ET.SubElement(r, "string", name=name)
        e.text = value.replace("'", "\\'")

    s("watch_face_name", t["watch_face_name"])
    for k in ("outfit_slot", "slot_left", "slot_right", "slot_bottom_left", "slot_bottom_right"):
        s(k, t[k])
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
