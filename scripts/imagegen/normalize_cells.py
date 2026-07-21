#!/usr/bin/env python3
"""Recover and safely reframe each sprite in a generated 4x4 sheet."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


CELL_WIDTH = 128
CELL_HEIGHT = 160
MARGIN = 4


def zero_runs(values: list[int], start: int, end: int) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    run_start: int | None = None
    for index in range(start, end):
        if values[index] == 0 and run_start is None:
            run_start = index
        elif values[index] != 0 and run_start is not None:
            runs.append((run_start, index))
            run_start = None
    if run_start is not None:
        runs.append((run_start, end))
    return runs


def find_seam(alpha: Image.Image, expected: int) -> int:
    counts = []
    for x in range(alpha.width):
        column = alpha.crop((x, 0, x + 1, alpha.height))
        counts.append(sum(value > 0 for value in column.getdata()))

    start = max(1, expected - 40)
    end = min(alpha.width - 1, expected + 40)
    runs = [run for run in zero_runs(counts, start, end) if run[1] - run[0] >= 3]
    if runs:
        return min(
            ((left + right) // 2 for left, right in runs),
            key=lambda value: abs(value - expected),
        )

    # Adjacent weapons and effects occasionally touch across a logical boundary.
    # In that case, keep the contract boundary instead of drifting into a sprite.
    return expected


def normalize(path: Path) -> list[float]:
    source = Image.open(path).convert("RGBA")
    if source.size != (512, 640):
        raise ValueError(f"{path}: expected 512x640, got {source.size}")

    result = Image.new("RGBA", source.size, (0, 0, 0, 0))
    scales: list[float] = []

    for row in range(4):
        row_image = source.crop((0, row * CELL_HEIGHT, 512, (row + 1) * CELL_HEIGHT))
        alpha = row_image.getchannel("A")
        seams = [0] + [find_seam(alpha, boundary) for boundary in (128, 256, 384)] + [512]

        frames: list[Image.Image] = []
        offsets: list[tuple[int, int]] = []
        for column in range(4):
            region = row_image.crop((seams[column], 0, seams[column + 1], CELL_HEIGHT))
            box = region.getchannel("A").getbbox()
            if box is None:
                raise ValueError(f"{path}: empty frame at row {row + 1}, column {column + 1}")
            frames.append(region.crop(box))
            offsets.append((box[1], box[3]))

        max_width = max(frame.width for frame in frames)
        max_height = max(frame.height for frame in frames)
        scale = min(1.0, (CELL_WIDTH - 2 * MARGIN) / max_width, (CELL_HEIGHT - 2 * MARGIN) / max_height)
        scales.append(scale)

        for column, (frame, (top, bottom)) in enumerate(zip(frames, offsets, strict=True)):
            if scale < 1.0:
                frame = frame.resize(
                    (max(1, round(frame.width * scale)), max(1, round(frame.height * scale))),
                    Image.Resampling.NEAREST,
                )

            x = column * CELL_WIDTH + (CELL_WIDTH - frame.width) // 2
            original_center = (top + bottom) / 2
            y_in_cell = round(original_center - frame.height / 2)
            y_in_cell = max(MARGIN, min(CELL_HEIGHT - MARGIN - frame.height, y_in_cell))
            result.alpha_composite(frame, (x, row * CELL_HEIGHT + y_in_cell))

    result.save(path, optimize=True)
    return scales


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args()
    for path in args.paths:
        scales = normalize(path)
        print(path.name, "scales=" + ",".join(f"{scale:.3f}" for scale in scales))


if __name__ == "__main__":
    main()
