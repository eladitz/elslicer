#!/usr/bin/env python3
"""Generates every Elslicer logo file from one drawing.

Orca's image file names stay as they are, because the app's code refers to them;
only the artwork inside changes. Needs fonttools, rsvg-convert, magick and iconutil.

    python3 branding/make_brand.py
"""
import shutil
import subprocess
import tempfile
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "resources/images"
FONT = ROOT / "resources/fonts/Sarabun-SemiBold.ttf"

TOP, BOTTOM = "#A9AAF8", "#5B5BD6"
INK, TEXT, GRAY = "#14141C", "#ECECEE", "#8A8C94"

# Nine printed layers. Each row is a layer, and together they read as an E.
ROW_H, ROW_GAP, SPINE = 50, 14, 130
LONG, MID = 430, 340
ROWS = [LONG, LONG, SPINE, SPINE, MID, SPINE, SPINE, LONG, LONG]
MARK_W, MARK_H = LONG, len(ROWS) * ROW_H + (len(ROWS) - 1) * ROW_GAP


def rows(x, y, scale, fill):
    out = []
    for i, width in enumerate(ROWS):
        out.append(
            f'<rect x="{x:.2f}" y="{y + i * (ROW_H + ROW_GAP) * scale:.2f}" width="{width * scale:.2f}" '
            f'height="{ROW_H * scale:.2f}" rx="{12 * scale:.2f}" ry="{12 * scale:.2f}" fill="{fill}"/>'
        )
    return "".join(out)


def gradient(x1, y1, y2):
    return (
        f'<defs><linearGradient id="elslicerLayers" gradientUnits="userSpaceOnUse" x1="{x1:.2f}" y1="{y1:.2f}" x2="{x1:.2f}" y2="{y2:.2f}">'
        f'<stop offset="0" stop-color="{TOP}"/><stop offset="1" stop-color="{BOTTOM}"/></linearGradient></defs>'
    )


def mark(x, y, height, fill=None):
    """The E at a position. fill=None uses the brand gradient."""
    scale = height / MARK_H
    if fill is None:
        return gradient(x, y, y + height) + rows(x, y, scale, "url(#elslicerLayers)")
    return rows(x, y, scale, fill)


def word(text, x, baseline, size, fill):
    """Outlined text, because the app's SVG renderer can't draw fonts."""
    font = TTFont(FONT)
    glyphs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
    scale = size / font["head"].unitsPerEm
    pen = SVGPathPen(glyphs)
    cursor = x
    for char in text:
        name = cmap[ord(char)]
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, baseline)))
        cursor += hmtx[name][0] * scale
    return f'<path d="{pen.getCommands()}" fill="{fill}"/>', cursor - x


def svg(width, height, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{body}</svg>\n'


def app_icon():
    # macOS icons sit inside a 1024 canvas with a margin.
    height = 560
    x, y = (1024 - MARK_W * height / MARK_H) / 2, (1024 - height) / 2
    plate = f'<rect x="100" y="100" width="824" height="824" rx="186" ry="186" fill="{INK}"/>'
    return svg(1024, 1024, plate + mark(x, y, height))


def square_mark(fill=None):
    height = 800
    return svg(1024, 1024, mark((1024 - MARK_W * height / MARK_H) / 2, 112, height, fill))


def wordmark(width, height):
    mark_h = height * 0.72
    mark_w = MARK_W * mark_h / MARK_H
    size = height * 0.62
    text, text_w = word("Elslicer", 0, 0, size, TEXT)
    left = (width - (mark_w + height * 0.2 + text_w)) / 2
    text, _ = word("Elslicer", left + mark_w + height * 0.2, height * 0.5 + size * 0.235, size, TEXT)
    return svg(width, height, mark(left, (height - mark_h) / 2, mark_h) + text)


def splash():
    text, text_w = word("Elslicer", 0, 0, 72, TEXT)
    text, _ = word("Elslicer", (480 - text_w) / 2, 385, 72, TEXT)
    height = 220
    return svg(480, 480, mark((480 - MARK_W * height / MARK_H) / 2, 85, height) + text)


def write_vectors(out):
    (out / "icon.svg").write_text(app_icon())
    (out / "mark.svg").write_text(square_mark())
    (out / "wordmark.svg").write_text(wordmark(560, 125))
    (out / "splash.svg").write_text(splash())
    for name in ("OrcaSlicer", "OrcaSlicer_gradient", "OrcaSlicer_gradient_circle", "OrcaSlicer_gradient_narrow", "studio_logo"):
        (IMAGES / f"{name}.svg").write_text(square_mark())
    (IMAGES / "OrcaSlicer_gray.svg").write_text(square_mark(GRAY))
    for name in ("OrcaSlicer_about", "OrcaSlicer_about_dark"):
        (IMAGES / f"{name}.svg").write_text(wordmark(560, 125))
    for name in ("OrcaSlicer_horizontal_dark", "OrcaSlicer_horizontal_light"):
        (IMAGES / f"{name}.svg").write_text(wordmark(214, 80))
    for name in ("splash_logo", "splash_logo_dark"):
        (IMAGES / f"{name}.svg").write_text(splash())


def render(source, target, size):
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", str(target), str(source)], check=True)


def size_of(path):
    result = subprocess.run(["sips", "-g", "pixelWidth", str(path)], check=True, capture_output=True, text=True)
    return int(result.stdout.split()[-1])


def write_bitmaps(out):
    icon, plain = out / "icon.svg", out / "mark.svg"
    for name in ("OrcaSlicer.png", "OrcaSlicer_128px.png", "OrcaSlicer_154.png", "OrcaSlicer_154_title.png", "OrcaSlicer_192px.png",
                 "OrcaSlicer_32px.png", "OrcaSlicer_64.png", "OrcaSlicer-mac_128px.png", "OrcaSlicerTitle.png"):
        render(icon, IMAGES / name, size_of(IMAGES / name))
    render(plain, IMAGES / "OrcaSlicer_192px_transparent.png", 192)
    render(icon, IMAGES / "OrcaSlicer_192px_grayscale.png", 192)
    subprocess.run(["magick", str(IMAGES / "OrcaSlicer_192px_grayscale.png"), "-colorspace", "Gray", str(IMAGES / "OrcaSlicer_192px_grayscale.png")], check=True)
    for name in ("logo.png", "logo2.png"):
        target = ROOT / "resources/web/image" / name
        render(icon, target, size_of(target))

    master = out / "icon_1024.png"
    render(icon, master, 1024)
    for name, sizes in (("OrcaSlicer.ico", "256,128,64,48,32,16"), ("OrcaSlicerTitle.ico", "256,64,32,16"), ("OrcaSlicer-mac_256px.ico", "256")):
        subprocess.run(["magick", str(master), "-define", f"icon:auto-resize={sizes}", str(IMAGES / name)], check=True)

    iconset = out / "Elslicer.iconset"
    iconset.mkdir()
    for size in (16, 32, 128, 256, 512):
        render(icon, iconset / f"icon_{size}x{size}.png", size)
        render(icon, iconset / f"icon_{size}x{size}@2x.png", size * 2)
    icns = out / "Elslicer.icns"
    subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(icns)], check=True)
    for target in (ROOT / "resources/Icon.icns", IMAGES / "OrcaSlicer.icns", IMAGES / "gcode.icns", IMAGES / "stl.icns"):
        shutil.copyfile(icns, target)

    # Kept beside this script as the logo to reuse elsewhere.
    for name in ("icon.svg", "mark.svg", "wordmark.svg", "splash.svg"):
        shutil.copyfile(out / name, ROOT / "branding" / name)
    render(icon, ROOT / "branding/icon_512.png", 512)


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        write_vectors(Path(tmp))
        write_bitmaps(Path(tmp))
    print("Brand files written")
