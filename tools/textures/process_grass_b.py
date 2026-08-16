"""
Turn a second painted grass fill into a seamless tile that matches the
original's average colour, so the game can blend the two without a grid.

The two tiles stay independent (each wraps on its own). They are not
assembled into an atlas — two seamless sheets do not share edges, so a
2×2 sheet would show a join. The shader picks between them per patch.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TEX = ROOT / "public" / "textures"
SIZE = 1024
BAND = 28


def lerp(a: tuple[int, ...], b: tuple[int, ...], t: float) -> tuple[int, ...]:
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


def edge_wrap(im: Image.Image, band: int = BAND) -> Image.Image:
    """Blend opposite edges so a nearly-seamless painting wraps."""
    im = im.convert("RGB").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    w, h = im.size
    px = im.load()
    out = im.copy()
    op = out.load()

    for y in range(h):
        for i in range(band):
            t = 0.5 - 0.5 * math.cos((i / (band - 1)) * math.pi)
            k = 0.5 * (1 - t)
            op[i, y] = lerp(px[i, y], px[w - 1 - i, y], k)
            op[w - 1 - i, y] = lerp(px[w - 1 - i, y], px[i, y], k)

    px = out.load()
    for x in range(w):
        for i in range(band):
            t = 0.5 - 0.5 * math.cos((i / (band - 1)) * math.pi)
            k = 0.5 * (1 - t)
            op[x, i] = lerp(px[x, i], px[x, h - 1 - i], k)
            op[x, h - 1 - i] = lerp(px[x, h - 1 - i], px[x, i], k)
    return out


def match_channels(src: Image.Image, ref: Image.Image) -> Image.Image:
    s = src.load()
    r = ref.load()
    w, h = src.size
    mean_s = [0.0, 0.0, 0.0]
    mean_r = [0.0, 0.0, 0.0]
    n = float(w * h)
    for y in range(h):
        for x in range(w):
            a = s[x, y]
            b = r[x, y]
            for i in range(3):
                mean_s[i] += a[i]
                mean_r[i] += b[i]
    for i in range(3):
        mean_s[i] /= n
        mean_r[i] /= n

    out = Image.new("RGB", (w, h))
    d = out.load()
    for y in range(h):
        for x in range(w):
            p = s[x, y]
            d[x, y] = tuple(
                max(0, min(255, int(p[i] - mean_s[i] + mean_r[i])))
                for i in range(3)
            )
    return out


def preview_repeat(im: Image.Image, n: int = 2) -> Image.Image:
    w, h = im.size
    out = Image.new("RGB", (w * n, h * n))
    for y in range(n):
        for x in range(n):
            out.paste(im, (x * w, y * h))
    return out.resize((1024, 1024), Image.Resampling.LANCZOS)


def main() -> None:
    original = Image.open(TEX / "grass.png").convert("RGB").resize(
        (SIZE, SIZE), Image.Resampling.LANCZOS
    )
    src = Path(__file__).with_name("grass_b_raw.jpg")
    if not src.exists():
        raise SystemExit(f"missing {src}")
    raw = Image.open(src)

    variant = match_channels(edge_wrap(raw), original)
    variant.save(TEX / "grass_b.png", optimize=True)
    preview = Path(__file__).with_name("grass_b_2x2.png")
    preview_repeat(variant, 2).save(preview)
    print(f"wrote {TEX / 'grass_b.png'} ({variant.size[0]}x{variant.size[1]})")
    print(f"preview {preview}")


if __name__ == "__main__":
    main()
