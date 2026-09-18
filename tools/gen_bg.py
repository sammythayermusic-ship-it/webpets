"""Produce the fish bowl `bg` layer at the habitat grid from the concept render.

Stage 1 deliberately does NOT make new art: the habitat grid doubled from 160x120 to 320x240 and the
whole point of that stage is that the rendered image does not change. So the bg is an exact integer
NEAREST upscale of `assets/habitats-160x120/fish-bowl.png`, which makes the flip verifiable — the app
at the new scale 1 is pixel-identical to the old app at scale 2.

The output path is `assets/habitats/fish/bowl/bg.png`, alongside the other bowl layers, so the manifest
stops encoding the resolution in a directory name. Stage 2 replaces the body of this script with a real
derivation from `assets/reference/habitats-hires/fish-bowl.png` (area-average downscale + palette
quantize); the path, the size assertion and the manifest entry stay the same.

Run: python3 tools/gen_bg.py
"""
from __future__ import annotations

import json
import os
from typing import Iterable

from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'assets')
MANIFEST = os.path.join(ASSETS, 'manifest.json')
CONCEPT = os.path.join(ASSETS, 'habitats-160x120', 'fish-bowl.png')
OUT = os.path.join(ASSETS, 'habitats', 'fish', 'bowl', 'bg.png')


def habitat_grid() -> tuple[int, int]:
    with open(MANIFEST, encoding='utf8') as fh:
        manifest = json.load(fh)
    grid = manifest['habitats']['fish/bowl']['grid']
    return int(grid[0]), int(grid[1])


def main(argv: Iterable[str] = ()) -> None:
    del argv
    grid_w, grid_h = habitat_grid()
    src = Image.open(CONCEPT).convert('RGBA')
    if src.width == 0 or grid_w % src.width or grid_h % src.height:
        raise SystemExit(
            f'grid {grid_w}x{grid_h} is not an integer multiple of the concept render {src.size}; '
            'a non-integer step needs a real downscale (Stage 2), not this script'
        )
    factor = grid_w // src.width
    if grid_h // src.height != factor:
        raise SystemExit(f'non-uniform upscale {grid_w // src.width}x/{grid_h // src.height}y from {src.size}')
    out = src.resize((grid_w, grid_h), Image.NEAREST)

    # Prove the no-op: every factor x factor block must be one colour, i.e. downsampling returns the source.
    assert out.resize(src.size, Image.NEAREST).tobytes() == src.tobytes(), 'upscale is not a pure nearest scale'

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out.save(OUT)
    print('wrote', os.path.relpath(OUT, ROOT), out.size, f'({factor}x NEAREST of {os.path.relpath(CONCEPT, ROOT)})')


if __name__ == '__main__':
    import sys
    main(sys.argv[1:])
