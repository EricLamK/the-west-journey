#!/usr/bin/env python3
"""Build 8-frame walk-cycle strip with shared-scale processing.

Critical fix: every frame uses the SAME scale factor derived from the median
bbox height across all 8 frames — prevents the per-frame zoom/shrink pulse
bug seen in the previous 6-frame attempt.

Alignment strategy mirrors build_atlas_animated.py:
- Tight bbox crop per frame
- Median height -> one shared scale
- Bottom-aligned + feet-centroid horizontal anchor per cell
- Output: 1536x192 RGBA PNG (8 x 192x192 cells)
"""
from __future__ import annotations

import sys
import statistics
from pathlib import Path

import numpy as np
from PIL import Image

CELL_W, CELL_H = 192, 192
N_FRAMES = 8
STRIP_W, STRIP_H = CELL_W * N_FRAMES, CELL_H
ALPHA_THRESHOLD = 16
TARGET_FILL = 0.88  # character body uses 88% of cell height

RAW_PATH = Path("/Users/lamkalok/Documents/the_west_journey/generated_imgs/edited-2026-04-27T04-20-43-805Z-78d2cr.png")
OUT_PATH = Path("/Users/lamkalok/Documents/the_west_journey/assets/hires-walk-cycle.png")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def chroma_key_magenta(img: Image.Image) -> Image.Image:
    """Remove magenta (#FF00FF-ish) background -> alpha 0."""
    arr = np.array(img.convert("RGBA"))
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    magenta = (r > 180) & (g < 80) & (b > 180)
    arr[magenta] = (0, 0, 0, 0)
    return Image.fromarray(arr, "RGBA")


def feet_center_x(alpha: np.ndarray, bbox: tuple[int, int, int, int]) -> int:
    """X coord (in original frame coords) of the centroid of the bottom-most opaque rows."""
    x0, y0, x1, y1 = bbox
    band_top = max(y0, y1 - 4)
    band = alpha[band_top:y1, x0:x1]
    cols_with_pixels = np.where(band.any(axis=0))[0]
    if len(cols_with_pixels) == 0:
        return (x0 + x1) // 2
    return x0 + int((cols_with_pixels.min() + cols_with_pixels.max()) / 2)


def split_into_cells(img: Image.Image, n: int) -> list[Image.Image]:
    """Split image into n equal-width horizontal cells.

    Handles two common model output layouts:
    - 1×8 single row  (all 8 frames in one horizontal band, may be in a tall square image)
    - 2×4 two rows of 4 (stitch into virtual 1×8)

    Detection: analyse where non-magenta content sits vertically.
    If content spans only one vertical band (content height < image_height * 0.3),
    treat as 1×N horizontal. Otherwise try 2×(N/2).
    """
    arr = np.array(img)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    is_magenta = (r > 180) & (g < 80) & (b > 180)
    is_content = ~is_magenta & (arr[..., 3] > ALPHA_THRESHOLD)

    rows_with_content = np.where(is_content.any(axis=1))[0]
    w, h = img.size

    if len(rows_with_content) == 0:
        # All magenta — fall back to naive horizontal split
        cell_w = w // n
        return [img.crop((i * cell_w, 0, (i + 1) * cell_w, h)) for i in range(n)]

    content_h = rows_with_content.max() - rows_with_content.min() + 1
    content_y0 = int(rows_with_content.min())
    content_y1 = int(rows_with_content.max()) + 1

    # If content is in a single horizontal band (< 35% of image height),
    # treat as 1×N layout by cropping to that band first
    if content_h < h * 0.35:
        band = img.crop((0, content_y0, w, content_y1))
        cell_w = w // n
        return [band.crop((i * cell_w, 0, (i + 1) * cell_w, content_y1 - content_y0)) for i in range(n)]

    # Two-row layout: check for a natural mid-point gap
    half = h // 2
    top_content = is_content[:half, :]
    bot_content = is_content[half:, :]
    if top_content.any() and bot_content.any():
        top = img.crop((0, 0, w, half))
        bot = img.crop((0, half, w, h))
        return split_into_cells(top, n // 2) + split_into_cells(bot, n // 2)

    # Fallback: plain horizontal split
    cell_w = w // n
    return [img.crop((i * cell_w, 0, (i + 1) * cell_w, h)) for i in range(n)]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print(f"Loading raw: {RAW_PATH}")
    raw_orig = Image.open(RAW_PATH)
    print(f"  Raw size: {raw_orig.size}")

    raw = chroma_key_magenta(raw_orig)

    cells = split_into_cells(raw, N_FRAMES)
    print(f"  Split into {len(cells)} cells of size {cells[0].size}")

    # Per-frame tight bboxes
    bboxes = [c.getbbox() for c in cells]
    print("  Per-frame bboxes:")
    for i, b in enumerate(bboxes):
        print(f"    frame {i}: {b}")

    valid_idx = [i for i, b in enumerate(bboxes) if b is not None]
    if not valid_idx:
        sys.exit("ERROR: all frames are empty after chroma-key!")

    heights = [bboxes[i][3] - bboxes[i][1] for i in valid_idx]
    widths  = [bboxes[i][2] - bboxes[i][0] for i in valid_idx]
    ref_h = statistics.median(heights)
    ref_w = statistics.median(widths)

    target_h = CELL_H * TARGET_FILL
    target_w = CELL_W * TARGET_FILL
    # Scale by height primarily; clamp by width too
    scale = min(target_h / ref_h, target_w / ref_w)

    print(f"  Median bbox: {ref_w:.1f}w x {ref_h:.1f}h  ->  shared scale = {scale:.4f}")

    strip = Image.new("RGBA", (STRIP_W, STRIP_H), (0, 0, 0, 0))

    final_heights = []

    for col, (cell, bbox) in enumerate(zip(cells, bboxes)):
        if bbox is None:
            print(f"  frame {col}: EMPTY, skipping")
            final_heights.append(0)
            continue

        cropped = cell.crop(bbox)
        cw, ch = cropped.size
        new_w = max(1, int(cw * scale))
        new_h = max(1, int(ch * scale))

        # Use NEAREST to preserve pixel-art crispness
        resized = cropped.resize((new_w, new_h), Image.Resampling.NEAREST)

        # Feet-centroid horizontal anchor
        alpha_arr = np.array(cell)[..., 3] > ALPHA_THRESHOLD
        fx = feet_center_x(alpha_arr, bbox)
        fx_in_crop = fx - bbox[0]
        fx_scaled = int(fx_in_crop * scale)

        # Bottom-aligned, feet-centred
        x = col * CELL_W + (CELL_W // 2) - fx_scaled
        # Clamp so we don't write outside the cell (allow slight overflow for effects)
        x = max(col * CELL_W - 16, min(col * CELL_W + CELL_W - new_w + 16, x))
        y = CELL_H - new_h  # bottom-aligned

        strip.paste(resized, (x, y), resized)
        final_heights.append(new_h)
        print(f"  frame {col}: bbox={bbox}, new_size=({new_w},{new_h}), placed at ({x},{y})")

    # Save
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    strip.save(OUT_PATH, "PNG", optimize=True)
    print(f"\nWrote: {OUT_PATH} ({STRIP_W}x{STRIP_H})")

    # Consistency report
    valid_heights = [h for h in final_heights if h > 0]
    print(f"\nBody-height consistency check (post-scale, in pixels):")
    print(f"  Per-frame heights: {final_heights}")
    print(f"  Min: {min(valid_heights)}  Max: {max(valid_heights)}  Spread: {max(valid_heights) - min(valid_heights)} px")
    if max(valid_heights) - min(valid_heights) <= 8:
        print("  PASS: spread <= 8 px (acceptable walk bob)")
    else:
        print("  WARNING: spread > 8 px — check for pose outliers")


if __name__ == "__main__":
    main()
