#!/usr/bin/env python3
"""Resize a transparent generated icon to the Warlords UI asset contract."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--size", type=int, default=128)
    args = parser.parse_args()

    image = Image.open(args.input).convert("RGBA")
    image = image.resize((args.size, args.size), Image.Resampling.NEAREST)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, optimize=True)

    alpha = image.getchannel("A")
    corners = [
        image.getpixel((0, 0))[3],
        image.getpixel((args.size - 1, 0))[3],
        image.getpixel((0, args.size - 1))[3],
        image.getpixel((args.size - 1, args.size - 1))[3],
    ]
    print(
        f"{args.output}: size={image.size} alpha={alpha.getextrema()} "
        f"bbox={alpha.getbbox()} corners={corners}"
    )


if __name__ == "__main__":
    main()
