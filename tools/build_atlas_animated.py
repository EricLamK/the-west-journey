#!/usr/bin/env python3
"""Compose animated enemy atlases from per-creature 7-frame sequences.

Atlas layout: 1344 (7 cols x 192) x 480 (3 rows x 160).
Rows (top->bottom): mob1, mob2, boss.
Cols (left->right): idle, walk1, walk2, attack, hurt, dead, special.

Alignment strategy
------------------
Earlier versions of this script used a single union bbox across all 7 frames
to compute one shared crop + scale. That works when every pose has a similar
silhouette, but Lv3+ revealed the failure mode: when the special frame has
a wide aura / projectile / tornado, the union bbox is dominated by that one
outlier and every other frame (especially the dead pose) ends up scaled
down to a tiny dot.

The current strategy:

* Trim each frame to its OWN tight bbox (preserves real per-pose shape).
* Pick the row's reference dimensions from the MEDIAN of frame bboxes — this
  ignores special-frame outliers in both directions (very wide effects,
  very small dead piles).
* Compute one shared scale from those reference dims so the character body
  stays visually consistent across the row.
* Place each frame bottom-aligned, horizontally centred on the bottom-row
  feet-centroid (more stable than bbox-centre when a frame has a weapon
  extending sideways).

Outlier frames may overflow the cell on the top or sides; that overflow is
clipped naturally by the row strip's bounds, which reads as "effects
extending past the cell edge" rather than "everything shrunk to fit".
"""
from __future__ import annotations
import sys
import statistics
from pathlib import Path
import numpy as np
from PIL import Image

CELL_W, CELL_H = 192, 160
COLS, ROWS = 7, 3
ATLAS_W, ATLAS_H = CELL_W * COLS, CELL_H * ROWS
ROW_FILL = {0: 0.78, 1: 0.92, 2: 1.0}
ALPHA_THRESHOLD = 16


def discover_frames(d: Path) -> list[Path]:
    schemes = [
        [d / f"frame-{i}.png" for i in range(7)],
        [d / f"combat-{i}.png" for i in range(1, 8)],
        [d / f"anim-{i}.png" for i in range(1, 8)],
    ]
    for frames in schemes:
        if all(p.exists() for p in frames):
            return frames
    raise SystemExit(f"could not find 7 frames in {d}")


def feet_center_x(arr_alpha: np.ndarray, bbox: tuple[int, int, int, int]) -> int:
    """X coord (in original frame) of the centroid of the bottom-most opaque rows."""
    x0, y0, x1, y1 = bbox
    band_top = max(y0, y1 - 4)
    band = arr_alpha[band_top:y1, x0:x1]
    cols_with_pixels = np.where(band.any(axis=0))[0]
    if len(cols_with_pixels) == 0:
        return (x0 + x1) // 2
    return x0 + int((cols_with_pixels.min() + cols_with_pixels.max()) / 2)


def build_row(frame_paths: list[Path], fill: float) -> Image.Image:
    raw = [Image.open(p).convert("RGBA") for p in frame_paths]
    arrs = [np.array(f) for f in raw]
    bboxes = [f.getbbox() for f in raw]

    valid_idx = [i for i, b in enumerate(bboxes) if b is not None]
    if not valid_idx:
        return Image.new("RGBA", (CELL_W * COLS, CELL_H), (0, 0, 0, 0))

    widths = [bboxes[i][2] - bboxes[i][0] for i in valid_idx]
    heights = [bboxes[i][3] - bboxes[i][1] for i in valid_idx]
    ref_w = statistics.median(widths)
    ref_h = statistics.median(heights)

    target_w = CELL_W * fill
    target_h = CELL_H * fill
    scale = min(target_w / ref_w, target_h / ref_h)

    strip = Image.new("RGBA", (CELL_W * COLS, CELL_H), (0, 0, 0, 0))
    for col, (frame, arr, bbox) in enumerate(zip(raw, arrs, bboxes)):
        if bbox is None:
            continue
        cropped = frame.crop(bbox)
        cw, ch = cropped.size
        new_w = max(1, int(cw * scale))
        new_h = max(1, int(ch * scale))
        actual_scale = scale
        if new_w > CELL_W or new_h > CELL_H:
            clamp = min(CELL_W / new_w, CELL_H / new_h)
            new_w = max(1, int(new_w * clamp))
            new_h = max(1, int(new_h * clamp))
            actual_scale *= clamp
        resized = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
        feet_x = feet_center_x(arr[:, :, 3] > ALPHA_THRESHOLD, bbox)
        feet_x_in_crop = feet_x - bbox[0]
        feet_x_scaled = int(feet_x_in_crop * actual_scale)
        x = col * CELL_W + (CELL_W // 2) - feet_x_scaled
        x = max(col * CELL_W, min(col * CELL_W + CELL_W - new_w, x))
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
