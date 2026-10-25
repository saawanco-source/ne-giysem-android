"""Puts the widget look test's pictures side by side: one sheet per text case and font size.

    python3 .github/scripts/widget_sheet.py widget-look
Writes widget-look/gorunum-<case>-<fontsize>.png.
"""
import pathlib
import re
import sys
from collections import defaultdict

from PIL import Image, ImageDraw

d = pathlib.Path(sys.argv[1])
groups = defaultdict(list)
for p in sorted(d.glob("*_f*_*x*.png")):
    m = re.match(r"(.+)_(f\d+)_(\d+)x(\d+)\.png$", p.name)
    if m:
        groups[(m.group(1), m.group(2))].append((int(m.group(3)), int(m.group(4)), p))

problems = set()
report = d / "rapor.txt"
if report.exists():
    last = None
    for line in report.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("!!") and last:
            problems.add(last)
        elif line and not line.startswith(" "):
            last = line.split()[0]

SCALE = 0.5
GAP = 16
for (case, font), items in groups.items():
    items.sort(key=lambda t: (t[1], t[0]))
    imgs = []
    for w, h, p in items:
        im = Image.open(p)
        im = im.resize((int(im.width * SCALE), int(im.height * SCALE)), Image.LANCZOS)
        imgs.append((f"{w}x{h}", p.stem in problems, im))
    width = 1600
    x = y = GAP
    row_h = 0
    places = []
    for label, bad, im in imgs:
        if x + im.width + GAP > width:
            x = GAP
            y += row_h + 30
            row_h = 0
        places.append((x, y, label, bad, im))
        x += im.width + GAP
        row_h = max(row_h, im.height)
    sheet = Image.new("RGB", (width, y + row_h + 40), (32, 34, 40))
    draw = ImageDraw.Draw(sheet)
    for x, y, label, bad, im in places:
        sheet.paste(im, (x, y))
        draw.text((x, y + im.height + 4), label + ("  SORUN" if bad else ""), fill=(255, 120, 110) if bad else (200, 200, 200))
    sheet.save(d / f"gorunum-{case}-{font}.png")
    print("sheet", case, font, len(imgs))
