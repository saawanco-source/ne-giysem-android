"""Checks watchface.xml against Google's Watch Face Format XSD (XSD 1.1) for the given format version.

    python3 watchface/tools/validate.py <path to google/watchface/third_party/wff/specification/documents> [version]

The schemas come from https://github.com/google/watchface (Apache 2.0); CI clones that repository.
"""
import pathlib
import sys

import xmlschema

ROOT = pathlib.Path(__file__).resolve().parents[2]
docs = pathlib.Path(sys.argv[1])
version = sys.argv[2] if len(sys.argv) > 2 else "2"
schema = xmlschema.XMLSchema11(str(docs / version / "watchface.xsd"))
face = ROOT / "watchface/src/main/res/raw/watchface.xml"
errors = list(schema.iter_errors(str(face)))
for e in errors[:15]:
    print("HATA:", e.reason, "|", e.path)
if errors:
    print(f"{len(errors)} hata: {face.relative_to(ROOT)} WFF v{version} şemasına uymuyor")
    sys.exit(1)
print(f"Geçerli: {face.relative_to(ROOT)} (WFF v{version})")
