#!/usr/bin/env python3
"""Compose animated enemy atlases from per-creature 7-frame sequences.

Atlas layout: 1344 (7 cols x 192) x 480 (3 rows x 160).
Rows (top->bottom): mob1, mob2, boss.
Cols (left->right): idle, walk1, walk2, attack, hurt, dead, special.

Each character provides 7 transparent PNG frames sharing the same cell size
and anchor (the generate2dsprite combat-mode pipeline guarantees this when
shared_scale=true). Frames are placed bottom-aligned, with row scaling 0.78
/ 0.92 / 1.0 so the boss reads largest.
"""
from __future__ import annotations
import sys
from pathlib import Path
from PIL import Image

CELL_W, CELL_H = 192, 160
COLS, ROWS = 7, 3
ATLAS_W, ATLAS_H = CELL_W * COLS, CELL_H * ROWS
ROW_FILL = {0: 0.78, 1: 0.92, 2: 1.0}


def fit_frame_into_cell(frame: Image.Image, fill: float) -> Image.Image:
    frame = frame.convert("RGBA")
    iw, ih = frame.size
    target_w = int(CELL_W * fill)
    target_h = int(CELL_H * fill)
    scale = min(target_w / iw, target_h / ih)
    new_w, new_h = max(1, int(iw * scale)), max(1, int(ih * scale))
    resized = frame.resize((new_w, new_h), Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    x = (CELL_W - new_w) // 2
    y = CELL_H - new_h - 4
    cell.paste(resized, (x, y), resized)
    return cell


def discover_frames(d: Path) -> list[Path]:
    """Find 7 frame PNGs in `d`. Tries common naming schemes in order."""
    schemes = [
        [d / f"frame-{i}.png" for i in range(7)],
        [d / f"combat-{i}.png" for i in range(1, 8)],
        [d / f"anim-{i}.png" for i in range(1, 8)],
    ]
    for frames in schemes:
        if all(p.exists() for p in frames):
            return frames
    raise SystemExit(f"could not find 7 frames in {d} (looked for frame-0..6, combat-1..7, anim-1..7)")


def build_row(frame_paths: list[Path], fill: float) -> Image.Image:
    strip = Image.new("RGBA", (CELL_W * COLS, CELL_H), (0, 0, 0, 0))
    for col, p in enumerate(frame_paths):
        cell = fit_frame_into_cell(Image.open(p), fill)
        strip.paste(cell, (col * CELL_W, 0), cell)
    return strip


def build_atlas(mob1_dir: Path, mob2_dir: Path, boss_dir: Path, out: Path) -> None:
    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    rows = [
        (discover_frames(mob1_dir), ROW_FILL[0]),
        (discover_frames(mob2_dir), ROW_FILL[1]),
        (discover_frames(boss_dir), ROW_FILL[2]),
    ]
    for r, (frames, fill) in enumerate(rows):
        atlas.paste(build_row(frames, fill), (0, r * CELL_H))
    out.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(out, "PNG", optimize=True)
    print(f"wrote {out} ({ATLAS_W}x{ATLAS_H})")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("usage: build_atlas_animated.py <mob1_dir> <mob2_dir> <boss_dir> <out.png>", file=sys.stderr)
        sys.exit(1)
    build_atlas(*(Path(p) for p in sys.argv[1:4]), Path(sys.argv[4]))
