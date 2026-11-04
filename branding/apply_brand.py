#!/usr/bin/env python3
"""Replaces Orca's colours and user-visible name with Elslicer's.

Scripted rather than hand-edited so it can be re-run after moving to a newer Orca.
Safe to run twice. It leaves identifiers, file names, URLs and profile names alone,
because the code and printer profiles depend on them.

    python3 branding/apply_brand.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

HEX_COLOURS = {
    "009688": "5B5BD6",
    "00897B": "4A4AC4",
    "26A69A": "7C7DEB",
    "4DB6AC": "9A9BF2",
    "00675B": "3D3DA8",
    "BFE1DE": "D2D2F7",
    "E5F0EE": "EAEAFB",
    "223C3C": "2B2B4D",
    "00FFEA": "9A9BF2",
}
COLOUR_PATTERNS = [
    (re.compile(r"(?i)(#|0x)(" + "|".join(HEX_COLOURS) + r")\b"), lambda m: m.group(1) + HEX_COLOURS[m.group(2).upper()]),
    (re.compile(r"(?<![\d.])0\s*,\s*150\s*,\s*136\b"), lambda m: "91, 91, 214"),
    (re.compile(r"0\.00?f\s*,\s*0\.59f\s*,\s*0\.53f"), lambda m: "0.36f, 0.36f, 0.84f"),
]

# Sentences that credit Orca's history stay as written. The licence requires the credit.
KEEP_SENTENCE = re.compile(r"began in that same spirit|is based on|Orca Cloud|OrcaCloud|Orca Arena|Orca Filament")
MACRO_STRINGS = re.compile(r'\b(?:_L|_u8L|L|_L_CONTEXT|_u8L_CONTEXT|L_CONTEXT|_L_PLURAL|_CTX|_CTX_utf8)\(\s*((?:"(?:[^"\\\n]|\\.)*"\s*)+)')


def rename(text):
    text = text.replace("Orca Slicer", "Elslicer").replace("OrcaSlicer", "Elslicer")
    return re.sub(r"\bOrca\b", "Elslicer", text)


def rename_macro(match):
    whole, strings = match.group(0), match.group(1)
    if KEEP_SENTENCE.search(strings):
        return whole
    return whole.replace(strings, rename(strings))


# Literal, user-visible strings outside the translation macros: (file, old, new).
LITERALS = [
    ("src/slic3r/GUI/WebGuideDialog.cpp", 'wxID_ANY, "OrcaSlicer"', 'wxID_ANY, "Elslicer"'),
    ("src/slic3r/GUI/GUI_App.cpp", '"OrcaSlicer", wxICON_QUESTION', '"Elslicer", wxICON_QUESTION'),
    ("src/slic3r/GUI/HttpServer.cpp", "return to OrcaSlicer", "return to Elslicer"),
    ("src/slic3r/GUI/MainFrame.cpp", 'wxBITMAP_TYPE_ICO), "OrcaSl', 'wxBITMAP_TYPE_ICO), "Elsl'),
    ("src/slic3r/GUI/AboutDialog.cpp", "Orca Slicer is based on PrusaSlicer and BambuStudio", "Elslicer is based on OrcaSlicer, PrusaSlicer and BambuStudio"),
    ("src/slic3r/GUI/GUI_Factories.cpp", 'L("Elslicer String Hell")', 'L("Stringing Test")'),
    ("src/slic3r/GUI/WebUserLoginDialog.cpp", 'wxID_ANY, "OrcaSlicer"', 'wxID_ANY, "Elslicer"'),
    ("src/slic3r/GUI/Gizmos/GLGizmoCut.cpp", "report to the OrcaSlicer team", "report to the Elslicer team"),
]

WEB_SKIP = ("elegoolink", "/elslicer/")
WEB_NAME = re.compile(r"(?<![\w./-])(?:Orca Slicer|OrcaSlicer)(?![\w./-])")

# Orca's own online account service has no meaning here, so its entries are hidden.
HOME_CSS = """
/* Elslicer: Orca's online account service isn't offered. */
#LoginArea, .BtnItem[menu="orca_cloud"], .BtnItem[onClick*="orcaslicer.com"], .BtnShortcut[onClick*="orcaslicer.com"] { display: none !important; }
"""


def sub_file(path, change):
    try:
        before = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return False
    after = change(before)
    if after != before:
        path.write_text(after, encoding="utf-8")
        return True
    return False


def recolour(text):
    for pattern, repl in COLOUR_PATTERNS:
        text = pattern.sub(repl, text)
    return text


def main():
    counts = {"colours": 0, "source wording": 0, "web wording": 0}

    sources = [p for base in ("src/slic3r", "src/libslic3r") for p in (ROOT / base).rglob("*") if p.suffix in (".cpp", ".hpp", ".mm", ".h")]
    for path in sources:
        counts["source wording"] += sub_file(path, lambda s: MACRO_STRINGS.sub(rename_macro, s))
    for rel, old, new in LITERALS:
        sub_file(ROOT / rel, lambda s: s.replace(old, new))

    colour_files = [p for p in (ROOT / "src/slic3r").rglob("*") if p.suffix in (".cpp", ".hpp", ".mm", ".h")]
    colour_files += list((ROOT / "resources/images").rglob("*.svg"))
    web = [p for p in (ROOT / "resources/web").rglob("*") if p.suffix in (".html", ".js", ".css", ".json", ".svg") and not any(s in "/" + p.relative_to(ROOT).as_posix() for s in WEB_SKIP)]
    colour_files += web
    for path in colour_files:
        counts["colours"] += sub_file(path, recolour)
    for path in web:
        counts["web wording"] += sub_file(path, lambda s: WEB_NAME.sub("Elslicer", s))

    for rel in ("resources/web/homepage/css/home.css", "resources/web/homepage/css/dark.css"):
        sub_file(ROOT / rel, lambda s: re.sub(r"\n/\* Elslicer: Orca's online.*?\}\n", "", s, flags=re.S) + HOME_CSS)

    print(counts)


if __name__ == "__main__":
    main()
