"""Renders the menu-bar tray icons from the duck in src-tauri/icons/app-icon.svg.

The tray is drawn at 18 pt high, so each PNG is 36x36 px: one pixel per
half-cell of the app icon's pixel grid, crisp on retina. Idle is the outline,
recording the filled silhouette, transcribing the outline with a faint fill.
While recording the silhouette also waddles: tray_waddle_left/right lean it from
the feet up, lifted a pixel.
macOS treats them as template images and only reads their alpha.

    python3 scripts/gen_tray_icons.py
"""

import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "src-tauri/icons/app-icon.svg"
OUT = ROOT / "src-tauri/resources"
CELL = 19.2  # half a duck pixel in the 1024 viewBox
SIZE = 36
EYE = (396.8, 281.6)

duck = SVG.read_text().split("shape-rendering")[1]
cells = set()
for x, y, w, h in re.findall(
    r'x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"', duck
):
    cx, cy = round(float(x) / CELL), round(float(y) / CELL)
    for i in range(round(float(w) / CELL)):
        for j in range(round(float(h) / CELL)):
            cells.add((cx + i, cy + j))

x0 = min(x for x, _ in cells)
y0 = min(y for _, y in cells)
outline = {(x - x0, y - y0) for x, y in cells}
width = max(x for x, _ in outline) + 1
height = max(y for _, y in outline) + 1

outside, stack = set(), [(-1, -1)]
while stack:
    p = stack.pop()
    if p in outside or p in outline:
        continue
    if not (-1 <= p[0] <= width and -1 <= p[1] <= height):
        continue
    outside.add(p)
    x, y = p
    stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]

ex, ey = round(EYE[0] / CELL) - x0, round(EYE[1] / CELL) - y0
eye = {(ex + i, ey + j) for i in (0, 1) for j in (0, 1)}
solid = {
    (x, y) for x in range(width) for y in range(height) if (x, y) not in outside
} - eye
inner = solid - outline

ox, oy = (SIZE - width) // 2, (SIZE - height) // 2


def waddled(cells, lean, lift):
    """Shear the cells around the feet by up to `lean` pixels at the head."""
    return {(x + round(lean * (height - 1 - y) / (height - 1)), y - lift) for x, y in cells}


def render(layers, rgb, name):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    for cellset, alpha in layers:
        for x, y in cellset:
            img.putpixel((ox + x, oy + y), rgb + (alpha,))
    img.save(OUT / name)


# Dark theme uses the light icons, light theme the `_dark` ones (see tray.rs).
for suffix, rgb in (("", (0xEC, 0xE7, 0xDD)), ("_dark", (0x0C, 0x0E, 0x0D))):
    render([(outline, 255)], rgb, f"tray_idle{suffix}.png")
    render([(solid, 255)], rgb, f"tray_recording{suffix}.png")
    render([(outline, 255), (inner, 110)], rgb, f"tray_transcribing{suffix}.png")

# The waddle is shown as template images only, so one colour is enough.
render([(waddled(solid, -2, 1), 255)], (0xEC, 0xE7, 0xDD), "tray_waddle_left.png")
render([(waddled(solid, 2, 1), 255)], (0xEC, 0xE7, 0xDD), "tray_waddle_right.png")
