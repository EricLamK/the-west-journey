#!/usr/bin/env python3
"""Compose 9-cell hero atlas from individual transparent sprite PNGs."""

from PIL import Image
import os, json

SPRITE_WORK = "/Users/lamkalok/Documents/the_west_journey/sprite_work/00-hero"
OUTPUT_ATLAS = "/Users/lamkalok/Documents/the_west_journey/assets/hires-pixel-sprites.png"

# Atlas layout: 3 cols x 3 rows, each cell 512x341 = 1536x1023 -> padded to 1536x1024
COLS = 3
ROWS = 3
CELL_W = 512
CELL_H = 341
ATLAS_W = COLS * CELL_W   # 1536
ATLAS_H = 1024             # target (1023 content + 1 pad row)

# Order: [action, col, row]
LAYOUT = [
    ("idle",    0, 0),
    ("run1",    1, 0),
    ("run2",    2, 0),
    ("jump",    0, 1),
    ("attack",  1, 1),
    ("hurt",    2, 1),
    ("crouch",  0, 2),
    ("special", 1, 2),
    ("spin",    2, 2),
]

def fit_into_cell(sprite: Image.Image, cell_w: int, cell_h: int) -> Image.Image:
    """Scale sprite to fit in cell while preserving aspect ratio, bottom-aligned."""
    sw, sh = sprite.size
    scale = min(cell_w / sw, cell_h / sh)
    new_w = int(sw * scale)
    new_h = int(sh * scale)
    resized = sprite.resize((new_w, new_h), Image.LANCZOS)
    # Paste onto transparent cell, bottom-aligned, horizontally centered
    cell = Image.new("RGBA", (cell_w, cell_h), (0, 0, 0, 0))
    x_off = (cell_w - new_w) // 2
    y_off = cell_h - new_h  # bottom-align
    cell.paste(resized, (x_off, y_off), resized)
    return cell

def main():
    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    coords = {}

    for action, col, row in LAYOUT:
        sprite_path = os.path.join(SPRITE_WORK, action, "sheet-transparent.png")
        if not os.path.exists(sprite_path):
            print(f"  WARNING: missing {sprite_path}")
            continue

        sprite = Image.open(sprite_path).convert("RGBA")
        cell = fit_into_cell(sprite, CELL_W, CELL_H)

        # Atlas position
        x = col * CELL_W
        y = row * CELL_H
        atlas.paste(cell, (x, y), cell)

        # Record coords as [sx, sy, w, h] = full cell rect
        coords[action] = [x, y, CELL_W, CELL_H]
        print(f"  {action}: cell ({col},{row}) -> sx={x}, sy={y}, w={CELL_W}, h={CELL_H}")

    atlas.save(OUTPUT_ATLAS)
    print(f"\nAtlas saved: {OUTPUT_ATLAS}")
    print(f"Atlas size: {atlas.size}, mode: {atlas.mode}")

    print("\nHERO_SPRITES coords:")
    for action, col, row in LAYOUT:
        if action in coords:
            sx, sy, w, h = coords[action]
            print(f'  {action}: [{sx}, {sy}, {w}, {h}],')

    return coords

if __name__ == "__main__":
    main()
