#!/usr/bin/env python3
"""Normalize a generated chroma-key sprite sheet to Warlords' 4x4 contract."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    image = Image.open(args.input).convert("RGBA")
    image = image.resize((512, 640), Image.Resampling.NEAREST)

    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            pixels[x, y] = (red, green, blue, 255 if alpha >= 128 else 0)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, optimize=True)

    alpha = image.getchannel("A")
    print(f"source={Image.open(args.input).size} final={image.size} alpha={alpha.getextrema()}")
    print(
        "corners="
        + str([image.getpixel(xy)[3] for xy in ((0, 0), (511, 0), (0, 639), (511, 639))])
    )
    for row in range(4):
        boxes = []
        for column in range(4):
            boxes.append(
                alpha.crop(
                    (column * 128, row * 160, (column + 1) * 128, (row + 1) * 160)
                ).getbbox()
            )
        print(f"row{row + 1}={boxes}")


if __name__ == "__main__":
    main()
