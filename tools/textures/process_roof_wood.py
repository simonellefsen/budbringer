"""Lift painted roof/wood fills to high-key seamless tiles."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TEX = ROOT / "public" / "textures"
SIZE = 1024
BAND = 36

RAW = Path(__file__).resolve().parent


def lerp(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


def edge_wrap(im: Image.Image, band: int = BAND) -> Image.Image:
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


def high_key(im: Image.Image, lift: float = 0.42) -> Image.Image:
    """Pull toward paper white so the map modulates palette colour."""
    px = im.load()
    out = im.copy()
    op = out.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            op[x, y] = tuple(min(255, int(p[i] + (255 - p[i]) * lift)) for i in range(3))
    return out


def preview(im: Image.Image, n: int = 2) -> Image.Image:
    w, h = im.size
    sheet = Image.new("RGB", (w * n, h * n))
    for y in range(n):
        for x in range(n):
            sheet.paste(im, (x * w, y * h))
    return sheet.resize((1024, 1024), Image.Resampling.LANCZOS)


def process(src: Path, dest_name: str) -> None:
    tile = high_key(edge_wrap(Image.open(src)))
    tile.save(TEX / dest_name, optimize=True)
    preview(tile).save(ROOT / "docs" / "texture-previews" / f"{dest_name[:-4]}_2x2.png")
    print("wrote", TEX / dest_name)


def main() -> None:
    (ROOT / "docs" / "texture-previews").mkdir(parents=True, exist_ok=True)
    process(RAW / "roof_raw.jpg", "roof.png")
    process(RAW / "wood_raw.jpg", "wood.png")


if __name__ == "__main__":
    main()
