#!/usr/bin/env python3
"""Regenerate L3/L4/L5 enemy atlases so each row depicts the SAME character.

Background
----------
The L3/L4/L5 atlases were AI-generated single-shot 1344x480 images. Each cell
within a row was drawn INDEPENDENTLY, so cells in the same row often depict
different characters (e.g. L4 boss row: idle is one bull, walk2 is a different
bull holding an iron fan, hurt is a decapitated body). No bbox normalization
can fix that; the pixel content itself is wrong.

What this script does
---------------------
For each (level, row):

1. Pick a "canonical idle" cell from the ORIGINAL atlas (in
   assets/enemies/_originals/). The canonical is chosen as the cell with the
   largest connected alpha component that fills the central area cleanly --
   this filters out cells where annotations or neighbor-bleed contaminate the
   art. The canonical is alpha-trimmed and saved to
   assets/enemies/_canonical/<level>-r<row>.png.

2. Synthesize the 7 frames procedurally from the canonical:
     col 0 idle   : canonical, centered, bottom-anchored.
     col 1 walk1  : canonical lifted ~3px (bob up) and shifted left ~2px.
     col 2 walk2  : canonical lowered ~2px (bob down) and shifted right ~2px.
                    Mirrored variant could be used but the engine flips the
                    sprite for facing already, so we keep facing identical.
     col 3 attack : canonical leaned forward (skew x), with a level-tinted
                    swipe arc overlay just in front of the character.
     col 4 hurt   : canonical leaned back (negative skew), red flash overlay.
     col 5 dead   : canonical laid on side (rotated 90 deg towards screen),
                    bottom-anchored.
     col 6 special: canonical lifted ~8px with a glowing aura disc underneath
                    in the level's main color.

The result preserves identity perfectly while still giving the engine 7
distinct frames to animate. It's a deliberate trade-off vs trying to
generate 6 new frames per character via image models -- which kept failing
to lock identity.

Atlas size and cell layout (1344x480, 192x160 cells, 7x3 grid) are preserved
so game.js doesn't need changes.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CELL_W, CELL_H = 192, 160
COLS, ROWS = 7, 3
COL_NAMES = ["idle", "walk1", "walk2", "attack", "hurt", "dead", "special"]
ALPHA_THRESH = 16

ROOT = Path(__file__).resolve().parent.parent
ORIGINALS = ROOT / "assets" / "enemies" / "_originals"
CANONICAL = ROOT / "assets" / "enemies" / "_canonical"
TARGET = ROOT / "assets" / "enemies"

# (display name, source filename, level color hex for FX overlays)
LEVELS = [
    ("L3", "03-yellow-wind-enemies.png", (209, 156, 61)),    # gold/yellow
    ("L4", "04-fire-enemies.png",        (216, 74, 54)),     # red
    ("L5", "05-lion-enemies.png",        (245, 192, 74)),    # gold accent
]


def extract_cell(img: Image.Image, r: int, c: int) -> Image.Image:
    return img.crop((c * CELL_W, r * CELL_H, (c + 1) * CELL_W, (r + 1) * CELL_H))


def largest_component(cell: Image.Image) -> Image.Image:
    """Return cell with only the largest connected alpha component kept.

    Uses 4-connectivity flood-fill. Strips orphan neighbor-bleed and stray
    annotation pixels.
    """
    arr = np.array(cell)
    A = arr[..., 3] > ALPHA_THRESH
    if not A.any():
        return cell
    # Label connected components.
    H, W = A.shape
    labels = np.zeros((H, W), dtype=np.int32)
    cur = 0
    sizes: list[int] = [0]
    stack: list[tuple[int, int]] = []
    for sy in range(H):
        for sx in range(W):
            if A[sy, sx] and labels[sy, sx] == 0:
                cur += 1
                size = 0
                stack.append((sy, sx))
                while stack:
                    y, x = stack.pop()
                    if y < 0 or y >= H or x < 0 or x >= W:
                        continue
                    if not A[y, x] or labels[y, x] != 0:
                        continue
                    labels[y, x] = cur
                    size += 1
                    stack.append((y + 1, x))
                    stack.append((y - 1, x))
                    stack.append((y, x + 1))
                    stack.append((y, x - 1))
                sizes.append(size)
    if cur == 0:
        return cell
    biggest = int(np.argmax(sizes))
    keep = labels == biggest
    out = arr.copy()
    out[~keep, 3] = 0
    return Image.fromarray(out, "RGBA")


def trim_bbox(cell: Image.Image) -> Image.Image:
    arr = np.array(cell)
    A = arr[..., 3] > ALPHA_THRESH
    if not A.any():
        return cell
    ys, xs = np.where(A)
    return cell.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def fit_into_cell(sprite: Image.Image, cell_w: int = CELL_W, cell_h: int = CELL_H,
                   max_h_frac: float = 1.0) -> Image.Image:
    """Uniform-scale sprite so it fits within (cell_w, cell_h*max_h_frac)."""
    sw, sh = sprite.size
    if sw == 0 or sh == 0:
        return sprite
    max_h = max(1, int(cell_h * max_h_frac))
    scale = min(cell_w / sw, max_h / sh, 1.0)
    if scale >= 0.999:
        return sprite
    nw = max(1, int(sw * scale))
    nh = max(1, int(sh * scale))
    return sprite.resize((nw, nh), Image.Resampling.LANCZOS)


def paste_into_cell(sprite: Image.Image, dx: int = 0, dy: int = 0,
                     anchor: str = "bottom") -> Image.Image:
    """Place sprite into a 192x160 cell.

    anchor="bottom": feet at row CELL_H + dy.
    anchor="center": center of sprite at (CELL_W/2 + dx, CELL_H/2 + dy).
    """
    cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    sw, sh = sprite.size
    if sw > CELL_W or sh > CELL_H:
        scale = min(CELL_W / sw, CELL_H / sh)
        sprite = sprite.resize((max(1, int(sw * scale)), max(1, int(sh * scale))), Image.Resampling.LANCZOS)
        sw, sh = sprite.size
    x = (CELL_W - sw) // 2 + dx
    if anchor == "bottom":
        y = CELL_H - sh + dy
    else:
        y = (CELL_H - sh) // 2 + dy
    cell.paste(sprite, (x, y))
    return cell


def overlay_color(sprite: Image.Image, rgb: tuple[int, int, int], alpha: float) -> Image.Image:
    """Tint visible pixels of sprite with rgb at given alpha (0..1)."""
    arr = np.array(sprite, dtype=np.float32)
    visible = arr[..., 3] > ALPHA_THRESH
    if not visible.any():
        return sprite
    r, g, b = rgb
    arr[visible, 0] = arr[visible, 0] * (1 - alpha) + r * alpha
    arr[visible, 1] = arr[visible, 1] * (1 - alpha) + g * alpha
    arr[visible, 2] = arr[visible, 2] * (1 - alpha) + b * alpha
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def skew_horizontal(sprite: Image.Image, shear: float) -> Image.Image:
    """Affine shear: x' = x + shear * y. Positive shear leans top-right.
    The image is enlarged to avoid clipping."""
    if abs(shear) < 1e-3:
        return sprite
    sw, sh = sprite.size
    # New width grows by abs(shear)*sh
    extra = int(math.ceil(abs(shear) * sh))
    nw = sw + extra
    # Inverse transform (Image.transform uses inverse).
    if shear >= 0:
        # x_src = x_dst - shear*(sh - y_dst)
        a, b, c = 1, -shear, shear * sh
        d, e, f = 0, 1, 0
    else:
        a, b, c = 1, -shear, 0
        d, e, f = 0, 1, 0
    return sprite.transform((nw, sh), Image.AFFINE, (a, b, c, d, e, f),
                              resample=Image.Resampling.BICUBIC)


def add_swipe_arc(cell: Image.Image, color: tuple[int, int, int],
                  facing_right: bool = True) -> Image.Image:
    """Draw a translucent slash arc just in front of the character (assumed centered, bottom-anchored)."""
    overlay = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    cx = CELL_W // 2 + (28 if facing_right else -28)
    cy = CELL_H - 90
    r, g, b = color
    # Outer arc (wide, transparent)
    for i, (rr, alpha, w) in enumerate([(46, 80, 6), (38, 140, 5), (30, 200, 4)]):
        bbox = [cx - rr, cy - rr, cx + rr, cy + rr]
        if facing_right:
            draw.arc(bbox, start=300, end=60, fill=(r, g, b, alpha), width=w)
        else:
            draw.arc(bbox, start=120, end=240, fill=(r, g, b, alpha), width=w)
    # White inner slash for snap
    for rr, alpha, w in [(34, 150, 2), (28, 200, 2)]:
        bbox = [cx - rr, cy - rr, cx + rr, cy + rr]
        if facing_right:
            draw.arc(bbox, start=320, end=40, fill=(255, 255, 255, alpha), width=w)
        else:
            draw.arc(bbox, start=140, end=220, fill=(255, 255, 255, alpha), width=w)
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=0.7))
    out = cell.copy()
    out.alpha_composite(overlay)
    return out


def add_aura(cell: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    """Add a glowing aura disc behind the character (special pose)."""
    aura = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(aura)
    cx, cy = CELL_W // 2, CELL_H - 16
    r, g, b = color
    for rr, alpha in [(80, 50), (62, 100), (44, 150), (28, 200)]:
        draw.ellipse([cx - rr, cy - rr // 3, cx + rr, cy + rr // 3],
                     fill=(r, g, b, alpha))
    aura = aura.filter(ImageFilter.GaussianBlur(radius=4.0))
    out = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    out.alpha_composite(aura)
    out.alpha_composite(cell)
    # Add upward energy streaks
    streak = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(streak)
    for i, dx in enumerate([-32, -10, 14, 36]):
        sd.line([(cx + dx, CELL_H - 24), (cx + dx + (i - 2) * 4, CELL_H - 80 - i * 6)],
                fill=(r, g, b, 200), width=3)
        sd.line([(cx + dx, CELL_H - 28), (cx + dx + (i - 2) * 4, CELL_H - 90 - i * 6)],
                fill=(255, 255, 255, 180), width=1)
    streak = streak.filter(ImageFilter.GaussianBlur(radius=0.6))
    out.alpha_composite(streak)
    return out


def lay_down(sprite: Image.Image) -> Image.Image:
    """Make a corpse pose. For tall characters, rotate 90 deg so the body
    lies on its side (head points to the side). For already-horizontal
    creatures (e.g. lizards/quadrupeds), just vertical-squash + skew so it
    reads as collapsed on the ground rather than rotated upside-down."""
    sw, sh = sprite.size
    aspect = sh / max(sw, 1)
    if aspect >= 1.05:
        # Tall character (humanoid). Lay on side: rotate CCW 90 so head -> left.
        return sprite.transpose(Image.ROTATE_270)
    # Wide character (quadruped). Squash & faint forward-tilt.
    sq = sprite.resize((sw, max(1, int(sh * 0.55))), Image.Resampling.LANCZOS)
    return skew_horizontal(sq, shear=0.10)


def clip_cell_edges(cell: Image.Image, margin: int = 4) -> Image.Image:
    """Zero out alpha within `margin` px of each cell edge. Drops neighbor bleed
    that would otherwise glue onto our component via diagonal adjacency."""
    arr = np.array(cell)
    arr[:margin, :, 3] = 0
    arr[-margin:, :, 3] = 0
    arr[:, :margin, 3] = 0
    arr[:, -margin:, 3] = 0
    return Image.fromarray(arr, "RGBA")


# Manual canonical-cell overrides, per (level, row).
# Use these when auto-pick selects a non-idle pose that hurts the
# walk/idle frames. col index = COL_NAMES position. None = auto-pick.
CANONICAL_OVERRIDE: dict[tuple[str, int], int] = {
    ("L3", 1): 0,   # idle has bearded tornado warrior arms-crossed (cleaner than punch)
    ("L3", 2): 0,   # idle has full tiger king w/ trident standing
    ("L5", 0): 0,   # idle has lion warrior + naginata; auto picked too-small comp
    ("L5", 1): 0,   # idle has vulture demon; auto picked walk2 due to bleed
}


def make_canonical(level_tag: str, atlas_path: Path, row: int) -> Image.Image:
    """Pick the cleanest canonical idle for (level, row).

    Strategy:
    - Honour CANONICAL_OVERRIDE if set.
    - Otherwise try cells in priority order [0=idle, 2=walk2, 1=walk1, 3=attack]
      and pick the largest valid component.
    - Always clip 4-px edge margin first to drop neighbor cell bleed.
    """
    img = Image.open(atlas_path).convert("RGBA")
    override = CANONICAL_OVERRIDE.get((level_tag, row))
    if override is not None:
        cell = extract_cell(img, row, override)
        cell = clip_cell_edges(cell, margin=4)
        cleaned = largest_component(cell)
        trimmed = trim_bbox(cleaned)
        print(f"  {level_tag} row{row}: canonical from col {override} ({COL_NAMES[override]}) "
              f"[OVERRIDE], trimmed size {trimmed.size[0]}x{trimmed.size[1]}")
        return trimmed

    candidates = []
    # Strong idle bias.
    for c in [0, 2, 1, 3]:
        cell = extract_cell(img, row, c)
        cell = clip_cell_edges(cell, margin=4)
        cleaned = largest_component(cell)
        trimmed = trim_bbox(cleaned)
        tw, th = trimmed.size
        if tw < CELL_W * 0.25 or th < CELL_H * 0.25:
            continue
        arr = np.array(cleaned)
        score = int((arr[..., 3] > ALPHA_THRESH).sum())
        bias = {0: 1.40, 2: 1.0, 1: 1.0, 3: 0.85}.get(c, 1.0)
        candidates.append((score * bias, c, trimmed))
    if not candidates:
        return trim_bbox(extract_cell(img, row, 0))
    candidates.sort(key=lambda t: t[0], reverse=True)
    chosen_score, chosen_c, chosen_trimmed = candidates[0]
    print(f"  {level_tag} row{row}: canonical from col {chosen_c} ({COL_NAMES[chosen_c]}), "
          f"trimmed size {chosen_trimmed.size[0]}x{chosen_trimmed.size[1]}, score={chosen_score:.0f}")
    return chosen_trimmed


def synthesize_row(canonical: Image.Image, level_color: tuple[int, int, int]) -> list[Image.Image]:
    """Build 7 cells from a single canonical sprite. canonical is an
    alpha-trimmed image of the character standing.
    """
    # Fit canonical into cell with small bottom margin.
    base = fit_into_cell(canonical, max_h_frac=1.0)
    bw, bh = base.size

    # idle: bottom-centered, no offset.
    idle = paste_into_cell(base, dx=0, dy=0)

    # walk1: small step pose - shift x left, lift body 3px (bob up).
    walk1 = paste_into_cell(base, dx=-2, dy=-3)
    # walk2: shift x right, lower body 1px.
    walk2 = paste_into_cell(base, dx=+2, dy=-1)

    # attack: shear forward (top leans +x), then add swipe arc overlay.
    attack_sprite = skew_horizontal(base, shear=0.18)
    attack_sprite = fit_into_cell(attack_sprite, max_h_frac=1.0)
    attack_cell = paste_into_cell(attack_sprite, dx=4, dy=0)
    attack_cell = add_swipe_arc(attack_cell, level_color, facing_right=True)

    # hurt: shear back (top leans -x), red flash tint.
    hurt_sprite = skew_horizontal(base, shear=-0.14)
    hurt_sprite = fit_into_cell(hurt_sprite, max_h_frac=1.0)
    hurt_sprite = overlay_color(hurt_sprite, (255, 90, 90), 0.35)
    hurt_cell = paste_into_cell(hurt_sprite, dx=-3, dy=-1)

    # dead: lay character down (rotated for humanoids, squashed for quadrupeds).
    # Trim padding before fitting to keep things tight.
    dead_sprite = lay_down(base)
    # Allow full cell width since character is now on its side.
    dead_sprite = fit_into_cell(dead_sprite, max_h_frac=0.62)
    dead_sprite = overlay_color(dead_sprite, (35, 35, 35), 0.40)
    dead_cell = paste_into_cell(dead_sprite, dx=0, dy=0)

    # special: lift body up + glowing aura behind/under, plus upward energy lines.
    special_sprite = base
    special_cell = paste_into_cell(special_sprite, dx=0, dy=-10)
    special_cell = add_aura(special_cell, level_color)

    return [idle, walk1, walk2, attack_cell, hurt_cell, dead_cell, special_cell]


def regenerate_atlas(level_tag: str, src_filename: str, level_color: tuple[int, int, int]) -> None:
    src = ORIGINALS / src_filename
    dst = TARGET / src_filename
    print(f"\n=== {level_tag}: {src.name} ===")
    out = Image.new("RGBA", (CELL_W * COLS, CELL_H * ROWS), (0, 0, 0, 0))

    for row in range(ROWS):
        canonical = make_canonical(level_tag, src, row)
        # Save canonical for inspection.
        CANONICAL.mkdir(exist_ok=True, parents=True)
        canonical.save(CANONICAL / f"{level_tag}-r{row}.png")
        cells = synthesize_row(canonical, level_color)
        for c, cell in enumerate(cells):
            out.paste(cell, (c * CELL_W, row * CELL_H))

    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, "PNG", optimize=True)
    print(f"wrote {dst}")


def main() -> int:
    for tag, fname, color in LEVELS:
        regenerate_atlas(tag, fname, color)
    return 0


if __name__ == "__main__":
    sys.exit(main())
