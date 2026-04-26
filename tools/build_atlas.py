#!/usr/bin/env python3
"""Compose enemy atlases from per-creature 1024×1024 generations.

Atlas layout: 1344 (7 cols × 192) × 480 (3 rows × 160).
Row 0 = mob1, row 1 = mob2, row 2 = boss. Each row's 7 cells share the same
sprite for now (idle/walk/attack/hurt/dead/special use the same art); animation
can be added later by regenerating individual cells."""

from __future__ import annotations
import sys
from pathlib import Path
from PIL import Image

CELL_W, CELL_H = 192, 160
COLS, ROWS = 7, 3
ATLAS_W, ATLAS_H = CELL_W * COLS, CELL_H * ROWS
WHITE_THRESHOLD = 238  # pixels with all RGB >= this become transparent
ROW_FILL = {0: 0.78, 1: 0.92, 2: 1.0}  # fraction of cell each row fills


def remove_white_bg(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r >= WHITE_THRESHOLD and g >= WHITE_THRESHOLD and b >= WHITE_THRESHOLD:
                pixels[x, y] = (r, g, b, 0)
    return img


def trim_alpha(img: Image.Image) -> Image.Image:
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def fit_into_cell(img: Image.Image, fill: float) -> Image.Image:
    """Resize creature so longer side fits cell × fill, return padded RGBA cell."""
    target_w = int(CELL_W * fill)
    target_h = int(CELL_H * fill)
    iw, ih = img.size
    scale = min(target_w / iw, target_h / ih)
    new_w, new_h = max(1, int(iw * scale)), max(1, int(ih * scale))
    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    # Center horizontally; bottom-align vertically (creatures stand on ground)
    x = (CELL_W - new_w) // 2
    y = CELL_H - new_h - 4
    cell.paste(resized, (x, y), resized)
    return cell


def build_row(sprite_path: Path, fill: float) -> Image.Image:
    raw = Image.open(sprite_path)
    cleaned = trim_alpha(remove_white_bg(raw))
    cell = fit_into_cell(cleaned, fill)
    strip = Image.new("RGBA", (CELL_W * COLS, CELL_H), (0, 0, 0, 0))
    for c in range(COLS):
        strip.paste(cell, (c * CELL_W, 0), cell)
    return strip


def build_atlas(mob1: Path, mob2: Path, boss: Path, out: Path) -> None:
    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    for row, (path, fill) in enumerate([(mob1, ROW_FILL[0]), (mob2, ROW_FILL[1]), (boss, ROW_FILL[2])]):
        atlas.paste(build_row(path, fill), (0, row * CELL_H))
    out.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(out, "PNG", optimize=True)
    print(f"wrote {out} ({ATLAS_W}x{ATLAS_H})")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("usage: build_atlas.py <mob1.png> <mob2.png> <boss.png> <out.png>", file=sys.stderr)
        sys.exit(1)
    build_atlas(*(Path(p) for p in sys.argv[1:]))
