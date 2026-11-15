"""Renders Quacky's app icon: the coloured pixel duck on a pale water tile.

Writes src-tauri/icons/app-icon.svg (rounded tile, the editable source),
src-tauri/icons/icon-source.png (full-bleed 1024 px, what `tauri icon` turns
into every size the bundle needs) and the previews quacky-icon.png and
quacky-icon-white.png at the repo root.

The duck rects in app-icon.svg keep the old 19.2-unit half-cell grid, so
scripts/gen_tray_icons.py still reads the outline from it.

    python3 scripts/gen_app_icon.py
    bun run tauri icon src-tauri/icons/icon-source.png
    python3 scripts/gen_app_icon.py --icns

The last step rebuilds icon.icns with Apple's iconutil from the same source,
which is the one macOS reads; it replaces the icns `tauri icon` writes.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "src-tauri/icons"

GRID = [
    ".......#########..............",
    ".....##ooooooo##..............",
    ".....##oo##ooo##..............",
    "#######ooooooo##..............",
    "#########ooooo##..............",
    ".......##ooo##............####",
    ".....####ooo##################",
    "...####ooooooooooooooooooooo##",
    "...##oooooooooooooooooo##ooo##",
    "...##oooooo##oooooooo##ooooo##",
    "...##oooooo##########ooooo##..",
    ".....##ooooooooooooooooo##....",
    ".......#################......",
    "...........##....##...........",
    "...........##....##...........",
    ".......######..######.........",
]

LINE = "#2973DB"
FILL = "#FFFFFF"
BILL = "#FF8C26"
PRINT = "#6B9EDB"
SHINE = "#A6C8F0"  # a glint on the puddle
TILE_TOP = "#E6F1FD"
TILE_BOTTOM = "#C4DCF7"

SIZE = 1024
CW, CH = 18, 36  # one duck cell in px: half as wide as tall
DUCK_W, DUCK_H = 30 * CW, 16 * CH
DX = (SIZE - DUCK_W) // 2 + 9  # the bill pulls the eye left; nudge right
DY = 197


def part(row, col):
    ch = GRID[row][col]
    if ch == ".":
        return None
    if row >= 13 or (row in (3, 4) and col < 7):
        return BILL
    return LINE if ch == "#" else FILL


# The puddle she stands in, in pixel steps: (first col, width) per half row.
# It starts behind her last row, so the feet are in the water. The legs match
# QuackyDuck's standing pose, not the original mark.
PUDDLE_Y = DY + 15 * CH
PUDDLE = [(5, 16), (2, 22), (1, 24), (2, 22), (5, 16)]
PUDDLE_ROW = CH // 2
GLINT = (19, 2, 4)  # col, puddle row, width


def runs():
    for row, line in enumerate(GRID):
        col = 0
        while col < len(line):
            colour = part(row, col)
            start = col
            while col < len(line) and part(row, col) == colour:
                col += 1
            if colour:
                yield colour, start, row, col - start


def tile(size, rounded):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    top = Image.new("RGB", (1, 2))
    top.putpixel((0, 0), tuple(int(TILE_TOP[i : i + 2], 16) for i in (1, 3, 5)))
    top.putpixel((0, 1), tuple(int(TILE_BOTTOM[i : i + 2], 16) for i in (1, 3, 5)))
    grad = top.resize((size, size), Image.BILINEAR).convert("RGBA")
    if not rounded:
        return grad
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=229, fill=255
    )
    img.paste(grad, (0, 0), mask)
    return img


def draw_duck(img):
    d = ImageDraw.Draw(img)
    for i, (first, width) in enumerate(PUDDLE):
        y = PUDDLE_Y + i * PUDDLE_ROW
        d.rectangle(
            (DX + first * CW, y, DX + (first + width) * CW - 1, y + PUDDLE_ROW - 1),
            fill=PRINT,
        )
    col, i, width = GLINT
    y = PUDDLE_Y + i * PUDDLE_ROW
    d.rectangle(
        (DX + col * CW, y, DX + (col + width) * CW - 1, y + PUDDLE_ROW - 1), fill=SHINE
    )
    for colour, col, row, width in runs():
        d.rectangle(
            (DX + col * CW, DY + row * CH, DX + (col + width) * CW - 1, DY + (row + 1) * CH - 1),
            fill=colour,
        )
    return img


def white_tile():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle(
        (0, 0, SIZE - 1, SIZE - 1), radius=229, fill="#FFFFFF"
    )
    return img


def svg():
    """The same picture as SVG. The duck is drawn in the old 19.2 x 38.4 unit
    grid at its old place (gen_tray_icons.py finds the eye there) and scaled
    to 18 x 36 px; only the mark cells are rects."""
    u, v = 19.2, 38.4
    ox, oy = 224, 204.8

    def box(c, r, w):
        return f"M{ox + c * u:g} {oy + r * v:g}h{w * u:g}v{v:g}h{-w * u:g}Z"

    inside = {FILL: "", BILL: ""}
    marks = {LINE: [], BILL: []}
    for colour, col, row, width in runs():
        for start, w, is_mark in segments(row, col, width):
            if is_mark:
                marks[colour].append(
                    f'<rect x="{ox + start * u:g}" y="{oy + row * v:g}" width="{w * u:g}" height="{v:g}"/>'
                )
            else:
                inside[colour] += box(start, row, w)
    puddle = "".join(
        f"M{DX + f * CW} {PUDDLE_Y + i * PUDDLE_ROW}h{w * CW}v{PUDDLE_ROW}h{-w * CW}Z"
        for i, (f, w) in enumerate(PUDDLE)
    )
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-labelledby="title desc">',
        '  <title id="title">Quacky app icon</title>',
        '  <desc id="desc">A white pixel duck with water-blue lines and an orange bill and feet, standing in a puddle on a pale blue tile.</desc>',
        "  <!-- Generated by scripts/gen_app_icon.py; edit it there. -->",
        '  <defs><linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{TILE_TOP}"/><stop offset="1" stop-color="{TILE_BOTTOM}"/>'
        "</linearGradient></defs>",
        '  <rect width="1024" height="1024" rx="229" fill="url(#tile)"/>',
        '  <g shape-rendering="crispEdges">',
        f'  <path fill="{PRINT}" d="{puddle}"/>',
        f'  <path fill="{SHINE}" d="M{DX + GLINT[0] * CW} {PUDDLE_Y + GLINT[1] * PUDDLE_ROW}h{GLINT[2] * CW}v{PUDDLE_ROW}h{-GLINT[2] * CW}Z"/>',
        f'  <g transform="translate({DX} {DY}) scale({CW / u:g}) translate({-ox} {-oy:g})">',
        f'    <path fill="{FILL}" d="{inside[FILL]}"/>',
        f'    <path fill="{BILL}" d="{inside[BILL]}"/>',
        '    <g>',
    ]
    for colour, rects in marks.items():
        lines.append(f'      <g fill="{colour}">')
        lines += [f"        {r}" for r in rects]
        lines.append("      </g>")
    lines += ["    </g>", "  </g>", "  </g>", "</svg>"]
    return "\n".join(lines) + "\n"


def segments(row, col, width):
    """Split a run into its mark cells and its inside cells."""
    c = col
    while c < col + width:
        is_mark = GRID[row][c] == "#"
        start = c
        while c < col + width and (GRID[row][c] == "#") == is_mark:
            c += 1
        yield start, c - start, is_mark


def icns():
    src = Image.open(ICONS / "icon-source.png").convert("RGBA")
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "icon.iconset"
        iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            for scale, suffix in ((1, ""), (2, "@2x")):
                px = size * scale
                src.resize((px, px), Image.LANCZOS).save(
                    iconset / f"icon_{size}x{size}{suffix}.png"
                )
        subprocess.run(
            ["iconutil", "-c", "icns", iconset, "-o", ICONS / "icon.icns"], check=True
        )


if __name__ == "__main__":
    if "--icns" in sys.argv:
        icns()
        sys.exit()
    (ICONS / "app-icon.svg").write_text(svg())
    draw_duck(tile(SIZE, rounded=False)).save(ICONS / "icon-source.png")
    draw_duck(tile(SIZE, rounded=True)).save(ROOT / "quacky-icon.png")
    draw_duck(white_tile()).save(ROOT / "quacky-icon-white.png")
