#!/usr/bin/env python3
"""Normalize 7-col x 3-row enemy atlases so animation frames don't bob/shrink/teleport.

Background
----------
L1/L2 atlases were composed via build_atlas_animated.py from per-frame sprites
with a shared scale and feet-centroid alignment. They animate cleanly.

L3/L4/L5 atlases are AI-generated single-shot 1344x480 images. Each cell was
drawn independently, so:
  * walk1 vs walk2 body heights differ by 20-30 px -> visible "bobbing"
  * attack/hurt poses are 30-60% shorter than idle -> body "sinks" into ground
    (the engine bottom-anchors each cell to enemy.y, so when the body shrinks
    the head drops while feet stay glued, which reads as "sinking")
  * hurt/dead frames are off-center horizontally -> sprite "teleports" sideways

What this script does
---------------------
For each row independently:

1. Compute a reference body height (`ref_h`) from the row. Default = the
   median of {idle, walk1, walk2}; these are the stable "standing" poses.
2. For each frame:
     a. Find the tight alpha bbox.
     b. Walk1/walk2 are equalized to a single shared "stand" height
        (= idle, clamped to min(idle, max(walk1, walk2)) to avoid up-scaling
        beyond source). Heights within +/- 4px of that target are left alone.
     c. Attack / hurt / special are scaled UP only if their height drops below
        SHRINK_FLOOR_FRAC * ref_h (default 0.78). Target height in that case
        is SHRINK_FLOOR_FRAC * ref_h. We never scale a frame to be taller
        than ref_h, and never up-scale by more than MAX_UPSCALE (1.45).
     d. Dead frame is intentionally allowed to be short (ground pose) but is
        forbidden from going BELOW DEAD_FLOOR_FRAC (0.30) of ref_h, so a
        dead frame that is only 13 px tall (L3 row0) is bumped up to a
        readable size. This avoids "vanished" enemies.
     e. After scaling, paste back into the cell:
          * Bottom-aligned to the cell's bottom row (feet on ground line).
          * Horizontally centered on the bbox-center, then nudged so the
            cell content is x-centered within CELL_W (engine also does
            recenter via cellOffsets, but this is more stable).
3. Save in place. Preserves the 1344x480 atlas size and the 192x160 cell
   layout so the engine doesn't need any change.

The script is idempotent in the sense that running it on an already-normalized
atlas should produce only tiny pixel-level differences from re-encoding.
"""
from __future__ import annotations

import argparse
import statistics
import sys
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image

CELL_W, CELL_H = 192, 160
COLS, ROWS = 7, 3
COL_NAMES = ["idle", "walk1", "walk2", "attack", "hurt", "dead", "special"]
ALPHA_THRESH = 16

# How short an action frame is allowed to be relative to ref_h before we
# scale it up to mask the shrink effect.
SHRINK_FLOOR_FRAC = 0.78
# How short a dead frame is allowed to be (it's OK for it to be short).
DEAD_FLOOR_FRAC = 0.30
# Cap how much we scale up a single frame; beyond this it gets blurry.
MAX_UPSCALE = 1.45


def cell_bbox(arr_alpha: np.ndarray, r: int, c: int) -> tuple[int, int, int, int] | None:
    cy0, cy1 = r * CELL_H, (r + 1) * CELL_H
    cx0, cx1 = c * CELL_W, (c + 1) * CELL_W
    cell = arr_alpha[cy0:cy1, cx0:cx1]
    if not cell.any():
        return None
    ys, xs = np.where(cell)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def extract_cell(img: Image.Image, r: int, c: int) -> Image.Image:
    cx0, cy0 = c * CELL_W, r * CELL_H
    return img.crop((cx0, cy0, cx0 + CELL_W, cy0 + CELL_H))


def trim_to_bbox(cell: Image.Image) -> Image.Image | None:
    arr = np.array(cell)
    A = arr[..., 3] > ALPHA_THRESH
    if not A.any():
        return None
    ys, xs = np.where(A)
    return cell.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def scale_to_height(sprite: Image.Image, target_h: int) -> Image.Image:
    sw, sh = sprite.size
    if sh == 0:
        return sprite
    scale = target_h / sh
    new_w = max(1, round(sw * scale))
    new_h = max(1, target_h)
    return sprite.resize((new_w, new_h), Image.Resampling.LANCZOS)


def paste_into_cell(sprite: Image.Image) -> Image.Image:
    """Bottom-aligned, horizontally centered.

    NOTE: pastes WITHOUT the alpha mask argument so per-pixel alpha bytes are
    copied verbatim. Using `paste(sprite, pos, sprite)` composites the sprite
    over the transparent canvas via its own alpha, which crushes any
    very-low-alpha (1-15) pixels to alpha=0 and silently strips fringe AA.
    That triggered visible top-row clipping on cells whose original art had
    soft top edges (e.g. L5 row2 idle).
    """
    cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    sw, sh = sprite.size
    if sw > CELL_W or sh > CELL_H:
        # Should not happen given clamps but guard anyway.
        clamp = min(CELL_W / sw, CELL_H / sh)
        sw2, sh2 = max(1, int(sw * clamp)), max(1, int(sh * clamp))
        sprite = sprite.resize((sw2, sh2), Image.Resampling.LANCZOS)
        sw, sh = sw2, sh2
    x = (CELL_W - sw) // 2
    y = CELL_H - sh
    cell.paste(sprite, (x, y))
    return cell


def max_h_within_cell(w: int, h: int, cell_w: int = CELL_W, cell_h: int = CELL_H) -> int:
    """Largest height a w x h sprite can take when uniform-scaled to fit cell_w x cell_h."""
    if w <= 0 or h <= 0:
        return 0
    by_w = int(h * cell_w / w)
    return min(cell_h, by_w)


def normalize_row(img: Image.Image, arr_alpha: np.ndarray, r: int, verbose: bool = False) -> list[Image.Image]:
    bboxes = [cell_bbox(arr_alpha, r, c) for c in range(COLS)]
    heights = [(b[3] - b[1] + 1) if b is not None else 0 for b in bboxes]
    widths = [(b[2] - b[0] + 1) if b is not None else 0 for b in bboxes]
    # max-achievable height per frame when uniform-scaled to fit a cell.
    max_h = [max_h_within_cell(w, h) for w, h in zip(widths, heights)]

    idle_h = heights[0]
    walk1_h, walk2_h = heights[1], heights[2]

    # === Stand height: walks must agree, idle should be close. ===
    # Pick the largest height that BOTH walk frames AND idle can reach (cell-fit).
    # Use the *smaller* of {idle, walk1, walk2} as a starting point, then ensure
    # each can be scaled up to it without overflowing.
    stand_candidates = [h for h in (idle_h, walk1_h, walk2_h) if h > 0]
    if stand_candidates:
        stand_h = min(stand_candidates)
        # Try to lift toward idle if both walks can reach it.
        achievable = [max_h[i] for i in (0, 1, 2) if heights[i] > 0]
        ceiling = min(achievable) if achievable else stand_h
        # Stand height = something everyone can reach.
        stand_h = min(idle_h or stand_h, ceiling)
        # Don't shrink below the smallest stand frame's natural height.
        stand_h = max(stand_h, min(stand_candidates))
        # Final bounds.
        stand_h = min(stand_h, CELL_H)
    else:
        stand_h = CELL_H

    # Reference height for action-frame floor: the chosen stand height.
    ref_h = stand_h

    if verbose:
        print(f"  row{r}: stand_h={stand_h} ref_h={ref_h} heights={heights} widths={widths} max_h={max_h}")

    out_cells: list[Image.Image] = []
    for c in range(COLS):
        cell = extract_cell(img, r, c)
        sprite = trim_to_bbox(cell)
        if sprite is None:
            out_cells.append(cell)
            continue
        sw, sh = sprite.size
        target_h = sh  # default: leave alone
        reason = ""

        if c == 0:
            # Idle: snap to stand_h to keep the standing pose consistent
            # with walks. If idle was originally taller, gently shrink.
            if abs(sh - stand_h) > 2 and stand_h > 0:
                target_h = stand_h
                reason = "idle->stand"
        elif c in (1, 2):
            # Walk frames: snap to stand_h. Always apply (kills bobbing).
            if abs(sh - stand_h) > 2 and stand_h > 0:
                target_h = stand_h
                reason = "walk->stand"
        elif c in (3, 4, 6):
            # attack / hurt / special: forbid going below SHRINK_FLOOR_FRAC * ref_h.
            floor = int(SHRINK_FLOOR_FRAC * ref_h)
            if sh < floor:
                # Up-scale, but never beyond what fits cell width or MAX_UPSCALE.
                cap = min(max_h_within_cell(sw, sh), int(sh * MAX_UPSCALE), CELL_H)
                target_h = min(floor, cap)
                reason = "action-floor"
        elif c == 5:
            # Dead: allow short, but not absurdly short.
            floor = int(DEAD_FLOOR_FRAC * ref_h)
            if sh < floor:
                cap = min(max_h_within_cell(sw, sh), int(sh * MAX_UPSCALE), CELL_H)
                target_h = min(floor, cap)
                reason = "dead-floor"

        # Apply.
        if target_h != sh and target_h > 0:
            new_w = max(1, round(sw * (target_h / sh)))
            if new_w > CELL_W:
                clamp = CELL_W / new_w
                target_h = max(1, int(target_h * clamp))
                new_w = CELL_W
            sprite = sprite.resize((new_w, target_h), Image.Resampling.LANCZOS)
            if verbose:
                print(f"    {COL_NAMES[c]:>7}: {sw}x{sh} -> {new_w}x{target_h} [{reason}]")

        out_cells.append(paste_into_cell(sprite))

    return out_cells


def normalize_atlas(in_path: Path, out_path: Path, verbose: bool = False) -> None:
    img = Image.open(in_path).convert("RGBA")
    if img.size != (CELL_W * COLS, CELL_H * ROWS):
        raise SystemExit(f"{in_path}: expected {CELL_W*COLS}x{CELL_H*ROWS}, got {img.size}")

    arr = np.array(img)
    A = arr[..., 3] > ALPHA_THRESH

    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    for r in range(ROWS):
        cells = normalize_row(img, A, r, verbose=verbose)
        for c, cell in enumerate(cells):
            out.paste(cell, (c * CELL_W, r * CELL_H))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path, "PNG", optimize=True)
    print(f"wrote {out_path}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Normalize enemy atlases (kill bobbing/sinking/teleport).")
    p.add_argument("inputs", nargs="+", help="Input atlas PNG paths.")
    p.add_argument("--in-place", action="store_true", help="Write back to the input path.")
    p.add_argument("--out-dir", default=None, help="Write outputs to this dir (mutually exclusive with --in-place).")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    if not args.in_place and not args.out_dir:
        print("error: pass --in-place or --out-dir", file=sys.stderr)
        return 2

    for src in args.inputs:
        srcp = Path(src)
        if args.in_place:
            outp = srcp
        else:
            outp = Path(args.out_dir) / srcp.name
        if args.verbose:
            print(f"normalizing {srcp}")
        normalize_atlas(srcp, outp, verbose=args.verbose)
    return 0


if __name__ == "__main__":
    sys.exit(main())
