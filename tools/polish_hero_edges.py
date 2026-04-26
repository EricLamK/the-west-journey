#!/usr/bin/env python3
"""Gentle edge polish for the chibi hero atlas.

Cleans up keyed-edge fringe artifacts without altering the underlying pixel
art. The pipeline:
  1. Pixels with very low alpha (<30) -> fully transparent + cleared color.
  2. Pixels with very high alpha (>=210) -> fully opaque (alpha=255).
  3. Mid-alpha pixels stay as-is (preserves any intentional soft AA the
     artist actually drew).
  4. Semi-transparent pixels touching a fully-transparent neighbor get
     bumped to opaque if alpha was already moderately high (>=120). This
     removes the 1-pixel halo that often sits around chroma-keyed silhouettes
     while leaving genuinely soft anti-aliased edges intact.

Usage:
  python3 tools/polish_hero_edges.py <in.png> <out.png>
"""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np
from PIL import Image


def polish(src: Path, dst: Path) -> None:
    img = Image.open(src).convert("RGBA")
    arr = np.array(img)
    alpha = arr[:, :, 3].astype(np.int16)

    transparent = alpha < 30
    opaque = alpha >= 210

    halo = np.zeros_like(alpha, dtype=bool)
    mid = (alpha >= 120) & (alpha < 210)
    h, w = alpha.shape
    if mid.any():
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                ys = slice(max(0, dy), min(h, h + dy))
                xs = slice(max(0, dx), min(w, w + dx))
                ys_n = slice(max(0, -dy), min(h, h - dy))
                xs_n = slice(max(0, -dx), min(w, w - dx))
                neighbor_clear = transparent[ys_n, xs_n]
                halo[ys, xs] |= mid[ys, xs] & neighbor_clear

    new_alpha = arr[:, :, 3].copy()
    new_alpha[transparent] = 0
    new_alpha[opaque] = 255
    new_alpha[halo] = 255
    arr[:, :, 3] = new_alpha
    arr[transparent] = (0, 0, 0, 0)

    Image.fromarray(arr, "RGBA").save(dst, "PNG", optimize=True)
    cleaned = int(transparent.sum())
    crisped = int(opaque.sum() + halo.sum())
    print(f"polished {src} -> {dst}: cleared {cleaned} fringe px, crisped {crisped} edge px")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: polish_hero_edges.py <in.png> <out.png>", file=sys.stderr)
        sys.exit(1)
    polish(Path(sys.argv[1]), Path(sys.argv[2]))
