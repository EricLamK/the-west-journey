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
    """Trim shared empty space across all frames, then resize with one shared
    scale and bottom-align in each column. The shared crop preserves the
    relative position of body parts across frames so the walk/attack/hurt
    cycle plays without horizontal jitter, while removing the dead pixels
    that were making creatures look small in the destination cell."""
    raw = [Image.open(p).convert("RGBA") for p in frame_paths]
    bboxes = [f.getbbox() for f in raw if f.getbbox() is not None]
    if not bboxes:
        return Image.new("RGBA", (CELL_W * COLS, CELL_H), (0, 0, 0, 0))
    union = (
        min(b[0] for b in bboxes),
        min(b[1] for b in bboxes),
        max(b[2] for b in bboxes),
        max(b[3] for b in bboxes),
    )
    cropped = [f.crop(union) for f in raw]
    cw, ch = union[2] - union[0], union[3] - union[1]
    target_w = int(CELL_W * fill)
    target_h = int(CELL_H * fill)
    scale = min(target_w / cw, target_h / ch)
    new_w, new_h = max(1, int(cw * scale)), max(1, int(ch * scale))
    new_w = min(new_w, CELL_W)
    new_h = min(new_h, CELL_H)
    strip = Image.new("RGBA", (CELL_W * COLS, CELL_H), (0, 0, 0, 0))
    for col, frame in enumerate(cropped):
        resized = frame.resize((new_w, new_h), Image.Resampling.LANCZOS)
        x = col * CELL_W + (CELL_W - new_w) // 2
        y = CELL_H - new_h
        strip.paste(resized, (x, y), resized)
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
