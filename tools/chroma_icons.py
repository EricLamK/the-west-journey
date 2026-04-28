"""Strip Gemini's painted checkerboard background from icon PNGs and trim/resize.

Flood-fills from each corner with a sentinel color, then converts those pixels
to transparent. Crops to the icon's bounding box plus a small pad and resizes
to 256x256 for use as a CSS background-image.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

OUT_SIZE = 256
PAD_PCT = 0.04
GREY_TOL = 5       # R==G==B ± this -> "grey-ish"
KEY_RADIUS = 8     # match window around each detected checker grey


def detect_checker_greys(img: Image.Image) -> list[int]:
    """Sample corners; return up to two dominant grey luminances used by Gemini's checkerboard."""
    from collections import Counter
    w, h = img.size
    counter: Counter = Counter()
    for cx, cy in [(0, 0), (w - 32, 0), (0, h - 32), (w - 32, h - 32)]:
        for y in range(cy, cy + 32):
            for x in range(cx, cx + 32):
                r, g, b = img.getpixel((x, y))
                if max(r, g, b) - min(r, g, b) <= GREY_TOL:
                    counter[r] += 1
    if not counter:
        return []
    # Cluster nearby values together; return up to 2 dominant grey luminances
    sorted_lums = sorted(counter.items(), key=lambda kv: -kv[1])
    keys: list[int] = []
    for lum, _ in sorted_lums:
        if all(abs(lum - k) > KEY_RADIUS for k in keys):
            keys.append(lum)
        if len(keys) == 2:
            break
    return keys


def chroma(src: Path, dst: Path) -> None:
    img = Image.open(src).convert("RGB")
    w, h = img.size
    keys = detect_checker_greys(img)
    if not keys:
        keys = [84, 130]
    print(f"  {src.name}: keys={keys}")
    rgba = Image.new("RGBA", (w, h))
    src_px = img.load()
    dst_px = rgba.load()
    for y in range(h):
        for x in range(w):
            r, g, b = src_px[x, y]
            is_grey = max(r, g, b) - min(r, g, b) <= GREY_TOL
            in_key = is_grey and any(abs(r - k) <= KEY_RADIUS for k in keys)
            if in_key:
                dst_px[x, y] = (0, 0, 0, 0)
            else:
                dst_px[x, y] = (r, g, b, 255)

    bbox = rgba.getbbox()
    if bbox:
        pad = int(min(w, h) * PAD_PCT)
        left = max(0, bbox[0] - pad)
        top = max(0, bbox[1] - pad)
        right = min(w, bbox[2] + pad)
        bottom = min(h, bbox[3] + pad)
        rgba = rgba.crop((left, top, right, bottom))

    cw, ch = rgba.size
    side = max(cw, ch)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(rgba, ((side - cw) // 2, (side - ch) // 2))
    canvas = canvas.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)

    # Threshold the alpha — anything < 180 -> 0, else -> 255 — kills LANCZOS halos
    # along chroma-keyed edges where transparent grey was averaged into grey/30%.
    out_px = canvas.load()
    for y in range(OUT_SIZE):
        for x in range(OUT_SIZE):
            r, g, b, a = out_px[x, y]
            if a < 180:
                out_px[x, y] = (0, 0, 0, 0)
            else:
                out_px[x, y] = (r, g, b, 255)

    canvas.save(dst, "PNG", optimize=True)
    print(f"  {src.name} -> {dst.name} ({canvas.size[0]}x{canvas.size[1]}, {dst.stat().st_size} bytes)" if dst.exists() else f"  {src.name} -> {dst.name}")


def main() -> int:
    icons_dir = Path("/Users/lamkalok/Documents/the_west_journey/assets/icons")
    files = sorted(icons_dir.glob("icon-*.png"))
    if not files:
        print("No icons found")
        return 1
    for f in files:
        chroma(f, f)
    return 0


if __name__ == "__main__":
    sys.exit(main())
