"""Generate PLACEHOLDER art for the fish bowl (Phase 0).

Outputs (all stamped with a tiny bitmap "PLACEHOLDER" label), sized from assets/manifest.json:
  assets/habitats/fish/bowl/{medium,decor_back,pantry,pantry_fill,decor_front,glass,night,memorial}.png

The fish strips are NOT generated here. As of Stage 2 they are real art derived from the goldfish painted
into the concept render; `tools/gen_fish.py` builds them. `bg` is likewise real art, from `tools/gen_bg.py`.
What is left here is the genuinely synthetic scaffolding, and only it carries the PLACEHOLDER stamp.

Resolution is a variable, not a literal. Every size and rect comes from the manifest:

  GRID_W, GRID_H   habitats['fish/bowl'].grid
  WATER            habitats['fish/bowl'].waterShape
  PANTRY_RECT      habitats['fish/bowl'].pantryRect
  OPAQUE_RECT      habitats['fish/bowl'].opaqueRect

FEEDER_BOX is the one piece of geometry the manifest does not carry; it is derived as PANTRY_RECT
inflated by one art unit on each side, so it can never drift from the rect the fill lives in.

Two multipliers do all the resolution work:

  ART_W = 160        the grid this layout was authored on; every hand-placed coordinate below is in
                     those art units, and `u(n)` maps one to the drawing canvas.
  U = GRID_W / ART_W the art-unit multiplier (2.0 at 320x240).
  UPSCALE            how much of U is applied as a final NEAREST upscale rather than by drawing bigger
                     (default 1, override with --upscale).

UPSCALE 1 draws natively at the full grid: `u(n)` is `round(n * U)` and circles, lines and gradients get
the resolution they are drawn at. Stage 1 used `--upscale 2`, which draws at GRID/2 and NEAREST-upscales,
so the output was *provably* the old 160x120 art scaled up (every 2x2 block one colour). That mode is kept
because it is the only way to re-verify that claim.

Stamp rule: every habitat layer carries the full word PLACEHOLDER (43x5 px in the 3x5 font, times the
effective stamp scale U). The word is abbreviated to `PH` in the STAMP colour only where it cannot fit:
`pantry_fill`, whose opaque pixels must stay inside pantryRect (see `check_pantry_fill`).
`src/render/placeholderStamps.test.ts` decodes the checked-in PNGs and asserts this.

`bg` is real art from `tools/gen_bg.py` and the fish strips are real art from `tools/gen_fish.py`; neither
is regenerated here.

Run: python3 tools/gen_placeholders.py [--grid W H] [--upscale N]
"""
from __future__ import annotations

import argparse
import json
import math
import os
from typing import Iterable

from PIL import Image, ImageDraw

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'assets')
BOWL_DIR = os.path.join(ASSETS, 'habitats', 'fish', 'bowl')
MANIFEST = os.path.join(ASSETS, 'manifest.json')

#: The grid the hand-placed coordinates in this file were authored on.
ART_W = 160

# --- filled in by `configure()` from the manifest ---------------------------------------------------
GRID_W = GRID_H = 0          # habitat grid, final px
UPSCALE = 1                  # final NEAREST upscale factor
CANVAS_W = CANVAS_H = 0      # habitat drawing canvas = GRID / UPSCALE
S = 1.0                      # art-unit -> drawing-canvas multiplier (= U / UPSCALE)
FONT_SCALE = 1               # stamp font scale on the drawing canvas
CONCEPT = ''                 # bg layer file, from the manifest

# Geometry on the drawing canvas (manifest values divided by UPSCALE).
WATER: dict[str, int] = {}
PANTRY_RECT: dict[str, int] = {}
FEEDER_BOX: dict[str, int] = {}
OPAQUE_RECT: dict[str, int] = {}

# Geometry in final px, straight from the manifest (the generation-time asserts check against these).
PANTRY_RECT_PX: dict[str, int] = {}


def u(n: float) -> int:
    """Map a hand-placed art-unit coordinate onto the drawing canvas."""
    return int(round(n * S))


def m(n: float) -> int:
    """Map a manifest value (final px) onto the drawing canvas."""
    return int(round(n / UPSCALE))


def configure(grid: tuple[int, int] | None = None, upscale: int | None = None) -> None:
    """Read every size and rect from assets/manifest.json and derive the drawing canvas."""
    global GRID_W, GRID_H, UPSCALE, CANVAS_W, CANVAS_H
    global S, FONT_SCALE, CONCEPT, WATER, PANTRY_RECT, FEEDER_BOX, OPAQUE_RECT, PANTRY_RECT_PX

    with open(MANIFEST, encoding='utf8') as fh:
        manifest = json.load(fh)
    bowl = manifest['habitats']['fish/bowl']

    GRID_W, GRID_H = grid if grid else (int(bowl['grid'][0]), int(bowl['grid'][1]))

    art_u = GRID_W / ART_W
    UPSCALE = upscale if upscale else 1
    for name, value in (('grid width', GRID_W), ('grid height', GRID_H)):
        if value % UPSCALE:
            raise SystemExit(f'{name} {value} is not divisible by --upscale {UPSCALE}')
    S = art_u / UPSCALE
    FONT_SCALE = max(1, int(round(S)))

    CANVAS_W, CANVAS_H = GRID_W // UPSCALE, GRID_H // UPSCALE

    bg = next(layer for layer in bowl['layers'] if layer['name'] == 'bg')
    CONCEPT = os.path.join(ASSETS, *bg['file'].split('/'))

    w = bowl['waterShape']
    WATER = {k: m(w[k]) for k in ('cx', 'cy', 'rx', 'ry', 'surfaceY', 'floorY')}
    PANTRY_RECT_PX = {k: int(bowl['pantryRect'][k]) for k in ('x', 'y', 'w', 'h')}
    PANTRY_RECT = {k: m(v) for k, v in PANTRY_RECT_PX.items()}
    OPAQUE_RECT = {k: m(int(bowl['opaqueRect'][k])) for k in ('x', 'y', 'w', 'h')}

    # The feeder outline as drawn in the concept art: pantryRect inflated by one art unit on each side.
    pad = u(1)
    FEEDER_BOX = {
        'x': PANTRY_RECT['x'] - pad,
        'y': PANTRY_RECT['y'] - pad,
        'w': PANTRY_RECT['w'] + 2 * pad,
        'h': PANTRY_RECT['h'] + 2 * pad,
    }


# --- colours ---
WATER_BLUE = (92, 168, 230, 90)
PLANT_GREEN = (56, 150, 72, 255)
PLANT_DARK = (30, 100, 50, 255)
FEEDER_GRAY = (70, 76, 90, 255)
FLAKE_TAN = (222, 160, 72, 255)
FLAKE_DARK = (186, 118, 48, 255)
SHEEN = (255, 255, 255, 70)
NIGHT_BLUE = (70, 84, 150, 255)
WHITE = (255, 255, 255, 255)
STAMP = (255, 40, 200, 255)

# 3x5 bitmap font (rows top→bottom, 1 = lit). Enough for the stamps.
FONT: dict[str, tuple[str, ...]] = {
    'A': ('010', '101', '111', '101', '101'),
    'B': ('110', '101', '110', '101', '110'),
    'C': ('011', '100', '100', '100', '011'),
    'D': ('110', '101', '101', '101', '110'),
    'E': ('111', '100', '110', '100', '111'),
    'F': ('111', '100', '110', '100', '100'),
    'G': ('011', '100', '101', '101', '011'),
    'H': ('101', '101', '111', '101', '101'),
    'I': ('111', '010', '010', '010', '111'),
    'K': ('101', '101', '110', '101', '101'),
    'L': ('100', '100', '100', '100', '111'),
    'M': ('101', '111', '111', '101', '101'),
    'N': ('110', '101', '101', '101', '101'),
    'O': ('010', '101', '101', '101', '010'),
    'P': ('110', '101', '110', '100', '100'),
    'R': ('110', '101', '110', '101', '101'),
    'S': ('011', '100', '010', '001', '110'),
    'T': ('111', '010', '010', '010', '010'),
    'U': ('101', '101', '101', '101', '111'),
    'Y': ('101', '101', '010', '010', '010'),
    '_': ('000', '000', '000', '000', '111'),
    ' ': ('000', '000', '000', '000', '000'),
}


def stamp(im: Image.Image, x: int, y: int, text: str, color=STAMP, scale: int | None = None) -> None:
    """Draw `text` with the 3x5 font at drawing-canvas (x, y), `scale` canvas px per font pixel."""
    px = im.load()
    step = FONT_SCALE if scale is None else scale
    for ch in text.upper():
        glyph = FONT.get(ch, FONT[' '])
        for gy, row in enumerate(glyph):
            for gx, bit in enumerate(row):
                if bit == '1':
                    for sy in range(step):
                        for sx in range(step):
                            xx, yy = x + gx * step + sx, y + gy * step + sy
                            if 0 <= xx < im.width and 0 <= yy < im.height:
                                px[xx, yy] = color
        x += 4 * step


def stamp_spot(mask: Image.Image, text: str, prefer_y: int, scale: int | None = None) -> tuple[int, int]:
    """Find a fully opaque place in `mask` for `text`, nearest to (canvas centre, prefer_y).

    The night layer is clipped to the bowl's alpha, so a stamp drawn over transparent pixels loses its
    glyphs and `src/render/placeholderStamps.test.ts` stops finding the word. Searching the mask instead of
    hardcoding a spot means new background art cannot silently erase the stamp.
    """
    step = FONT_SCALE if scale is None else scale
    w, h = (len(text) * 4 - 1) * step, 5 * step
    px = mask.load()
    cols = [[px[x, y][3] > 0 for x in range(mask.width)] for y in range(mask.height)]
    best: tuple[float, int, int] | None = None
    for y in range(mask.height - h + 1):
        if not all(cols[y + j][mask.width // 2] for j in range(h)):
            continue
        for x in range(mask.width - w + 1):
            if not all(cols[y + j][x + i] for j in range(h) for i in range(w)):
                continue
            cost = abs(x + w / 2 - mask.width / 2) + 2 * abs(y - prefer_y)
            if best is None or cost < best[0]:
                best = (cost, x, y)
    if best is None:
        raise SystemExit(f'no fully opaque {w}x{h} spot for the stamp "{text}"')
    return best[1], best[2]


def new_layer() -> Image.Image:
    return Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))


def concept_art() -> Image.Image:
    """The bg layer at drawing-canvas size (NEAREST, so an integer-upscaled bg round-trips exactly)."""
    im = Image.open(CONCEPT).convert('RGBA')
    return im if im.size == (CANVAS_W, CANVAS_H) else im.resize((CANVAS_W, CANVAS_H), Image.NEAREST)


def in_water(x: float, y: float) -> bool:
    if y < WATER['surfaceY'] or y > WATER['floorY']:
        return False
    dx = (x - WATER['cx']) / WATER['rx']
    dy = (y - WATER['cy']) / WATER['ry']
    return dx * dx + dy * dy <= 1.0


# ----------------------------------------------------------------------------- habitat layers

# The concept render has a fish painted into the water. Until the layered art exists the `medium` layer
# heals that patch with opaque water sampled from the same row, so the live sprite is the only fish.
PAINTED_FISH_SEARCH = dict(x0=50, x1=93, y0=44, y1=74)


def painted_fish_box(concept: Image.Image) -> tuple[int, int, int, int] | None:
    px = concept.load()
    s = PAINTED_FISH_SEARCH
    xs, ys = [], []
    for y in range(u(s['y0']), u(s['y1'])):
        for x in range(u(s['x0']), u(s['x1'])):
            r, g, b, a = px[x, y]
            if a > 0 and in_water(x + 0.5, y + 0.5) and r > g + 30 and r > b + 30:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs) - u(1), min(ys) - u(1), max(xs) + u(1), max(ys) + u(1)


def water_color_at_row(concept: Image.Image, y: int, x_from: int) -> tuple[int, int, int, int]:
    """Nearest bluish concept pixel left of x_from on row y (falls back to WATER_BLUE, opaque)."""
    px = concept.load()
    for x in range(x_from, 0, -1):
        r, g, b, a = px[x, y]
        if a > 200 and b > r + 20 and b > g:
            return (r, g, b, 255)
    return (WATER_BLUE[0], WATER_BLUE[1], WATER_BLUE[2], 255)


def gen_medium() -> Image.Image:
    im = new_layer()
    px = im.load()
    concept = concept_art()
    box = painted_fish_box(concept)
    band = max(1, u(3))
    for y in range(CANVAS_H):
        for x in range(CANVAS_W):
            if in_water(x + 0.5, y + 0.5):
                # faint horizontal shimmer bands so the tint reads
                a = WATER_BLUE[3] + (12 if (y // band) % 2 == 0 else 0)
                px[x, y] = (WATER_BLUE[0], WATER_BLUE[1], WATER_BLUE[2], a)
    if box is not None:
        x0, y0, x1, y1 = box
        for y in range(y0, y1 + 1):
            col = water_color_at_row(concept, y, x0 - 1)
            for x in range(x0, x1 + 1):
                if in_water(x + 0.5, y + 0.5):
                    px[x, y] = col
    stamp(im, u(66), u(62), 'MEDIUM')
    stamp(im, u(66), u(68), 'PLACEHOLDER')
    return im


def gen_decor_back() -> Image.Image:
    im = new_layer()
    d = ImageDraw.Draw(im)
    # a back plant: three stalks with leaves, rooted in the gravel on the left
    for sx, h in ((56, 30), (62, 40), (68, 34)):
        d.rectangle((u(sx), u(90 - h), u(sx + 1), u(90) + u(1) - 1), fill=PLANT_DARK)
        for k in range(3):
            ly = u(90 - h + 6 + k * 10)
            d.rectangle((u(sx - 3), ly, u(sx + 4) + u(1) - 1, ly + u(3) - 1), fill=PLANT_GREEN)
    stamp(im, u(50), u(30), 'DECOR')
    stamp(im, u(50), u(36), 'BACK')
    stamp(im, u(50), u(42), 'PLACEHOLDER')
    return im


def gen_pantry() -> Image.Image:
    im = new_layer()
    d = ImageDraw.Draw(im)
    b = FEEDER_BOX
    # feeder box: dark opaque interior (hides the concept's painted flakes) + outline + clip down the rim
    d.rectangle((b['x'], b['y'], b['x'] + b['w'] - 1, b['y'] + b['h'] - 1), fill=(38, 42, 52, 255),
                outline=FEEDER_GRAY, width=u(1))
    d.rectangle((b['x'] + u(16), b['y'] + b['h'], b['x'] + u(20) - 1, b['y'] + b['h'] + u(7) - 1),
                fill=FEEDER_GRAY)
    stamp(im, u(125), u(6), 'PANTRY')
    stamp(im, u(114), u(12), 'PLACEHOLDER')  # right of the feeder box, ends inside the grid
    return im


def gen_pantry_fill() -> Image.Image:
    im = new_layer()
    px = im.load()
    r = PANTRY_RECT
    period = max(1, u(3))
    for y in range(r['y'], r['y'] + r['h']):
        for x in range(r['x'], r['x'] + r['w']):
            px[x, y] = FLAKE_DARK if (x + y) % period == 0 else FLAKE_TAN
    # pantryRect cannot hold PLACEHOLDER (43 font px); `PH` is the sanctioned abbreviation here
    # (see module docstring).
    stamp(im, r['x'] + u(1), r['y'] + u(2), 'PH', color=STAMP)
    stamp(im, r['x'] + u(1), r['y'] + u(9), 'FILL', color=(120, 60, 20, 255))
    return im


def gen_decor_front() -> Image.Image:
    im = new_layer()
    d = ImageDraw.Draw(im)
    # a small front plant on the right side of the gravel
    for sx, h in ((100, 18), (105, 24)):
        d.rectangle((u(sx), u(94 - h), u(sx + 1), u(94) + u(1) - 1), fill=PLANT_DARK)
        for k in range(2):
            ly = u(94 - h + 4 + k * 8)
            d.rectangle((u(sx - 2), ly, u(sx + 3) + u(1) - 1, ly + u(2) - 1), fill=PLANT_GREEN)
    stamp(im, u(96), u(60), 'FRONT')
    stamp(im, u(78), u(66), 'PLACEHOLDER')
    return im


def gen_glass() -> Image.Image:
    im = new_layer()
    px = im.load()
    # a faint specular streak along the upper-left inside of the glass
    steps = 40 * max(1, u(1))
    for t in range(0, steps):
        ang = math.radians(150 + t / max(1, u(1)))
        x = int(round(WATER['cx'] + (WATER['rx'] - u(3)) * math.cos(ang)))
        y = int(round(WATER['cy'] + (WATER['ry'] - u(3)) * math.sin(ang)))
        for k in range(u(2)):
            if 0 <= x + k < CANVAS_W and 0 <= y < CANVAS_H:
                px[x + k, y] = SHEEN
    stamp(im, u(44), u(26), 'GLASS', color=(255, 255, 255, 140))
    stamp(im, u(44), u(32), 'PLACEHOLDER', color=(255, 255, 255, 140))
    return im


def gen_night() -> Image.Image:
    im = new_layer()
    d = ImageDraw.Draw(im)
    o = OPAQUE_RECT
    d.rectangle((o['x'], o['y'], o['x'] + o['w'] - 1, o['y'] + o['h'] - 1), fill=NIGHT_BLUE)
    # the feeder/lamp area stays bright (white = unchanged under multiply)
    b = FEEDER_BOX
    d.rectangle((b['x'] - u(2), b['y'] - u(2), b['x'] + b['w'] + u(2) - 1, b['y'] + b['h'] + u(2) - 1),
                fill=WHITE)
    # The alpha mask below clips this layer to the bowl, so both stamps must sit on opaque art; the spot is
    # searched for rather than hardcoded (see stamp_spot).
    concept_im = concept_art()
    wx, wy = stamp_spot(concept_im, 'PLACEHOLDER', u(106))
    stamp(im, wx, wy, 'PLACEHOLDER', color=(200, 210, 255, 255))
    nx, ny = stamp_spot(concept_im, 'NIGHT', wy - 6 * FONT_SCALE)
    stamp(im, nx, ny, 'NIGHT', color=(200, 210, 255, 255))
    # Multiply over a transparent pixel yields opaque black (DST_COLOR * src + dst * (1 - srcA) with dst = 0,
    # alpha ONE * srcA), so the night layer must be transparent wherever the bowl itself is transparent.
    concept = concept_im.load()
    px = im.load()
    for y in range(CANVAS_H):
        for x in range(CANVAS_W):
            if concept[x, y][3] == 0:
                px[x, y] = (0, 0, 0, 0)
    return im


def gen_memorial() -> Image.Image:
    im = concept_art().copy()
    px = im.load()
    # empty the water: bluish pixels inside the water body become pale, near-transparent glass
    for y in range(WATER['surfaceY'], WATER['floorY'] + 1):
        for x in range(CANVAS_W):
            r, g, b, a = px[x, y]
            if a > 0 and in_water(x + 0.5, y + 0.5) and b > r + 20 and b > g:
                px[x, y] = (236, 242, 246, 120)
    # remove the painted fish as well (same patch the medium layer heals)
    box = painted_fish_box(concept_art())
    if box is not None:
        x0, y0, x1, y1 = box
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if in_water(x + 0.5, y + 0.5):
                    px[x, y] = (236, 242, 246, 120)
    # a tiny flag planted in the gravel
    d = ImageDraw.Draw(im)
    d.rectangle((u(84), u(82), u(85) - 1, u(92) - 1), fill=(60, 50, 40, 255))
    d.polygon([(u(85), u(82)), (u(91), u(84)), (u(85), u(87))], fill=(220, 50, 50, 255))
    stamp(im, u(60), u(40), 'MEMORIAL', color=(120, 120, 130, 255))
    stamp(im, u(60), u(46), 'PLACEHOLDER', color=(120, 120, 130, 255))
    return im


# ----------------------------------------------------------------------------- main

def upscaled(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Nearest-upscale a drawing canvas to its final size (identity when UPSCALE == 1)."""
    if im.size == size:
        return im
    out = im.resize(size, Image.NEAREST)
    assert out.resize(im.size, Image.NEAREST).tobytes() == im.tobytes(), 'upscale is not a pure nearest scale'
    return out


def save(im: Image.Image, path: str, size: tuple[int, int]) -> None:
    assert im.size == size, f'{path}: {im.size} != {size}'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)
    print('wrote', os.path.relpath(path, ROOT), im.size)


def check_pantry_fill(im: Image.Image) -> None:
    """Final-size check: every opaque pixel lies inside the manifest pantryRect."""
    px = im.load()
    r = PANTRY_RECT_PX
    for y in range(GRID_H):
        for x in range(GRID_W):
            if px[x, y][3] > 0:
                assert r['x'] <= x < r['x'] + r['w'] and r['y'] <= y < r['y'] + r['h'], \
                    f'pantry_fill opaque pixel outside pantryRect at {x},{y}'


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--grid', nargs=2, type=int, metavar=('W', 'H'),
                   help='habitat grid override (default: assets/manifest.json)')
    p.add_argument('--upscale', type=int, metavar='N',
                   help='draw at grid/N and NEAREST-upscale by N (default: 1, i.e. draw natively)')
    return p.parse_args(list(argv))


def main(argv: Iterable[str] = ()) -> None:
    args = parse_args(argv)
    configure(
        grid=(args.grid[0], args.grid[1]) if args.grid else None,
        upscale=args.upscale,
    )
    print(f'grid {GRID_W}x{GRID_H}, canvas {CANVAS_W}x{CANVAS_H}, upscale {UPSCALE}x, '
          f'art unit {S}, font scale {FONT_SCALE}')

    grid_size = (GRID_W, GRID_H)
    layers = {
        'medium': gen_medium(),
        'decor_back': gen_decor_back(),
        'pantry': gen_pantry(),
        'pantry_fill': gen_pantry_fill(),
        'decor_front': gen_decor_front(),
        'glass': gen_glass(),
        'night': gen_night(),
        'memorial': gen_memorial(),
    }
    final = {name: upscaled(im, grid_size) for name, im in layers.items()}
    check_pantry_fill(final['pantry_fill'])
    for name, im in final.items():
        save(im, os.path.join(BOWL_DIR, f'{name}.png'), grid_size)



if __name__ == '__main__':
    import sys
    main(sys.argv[1:])
