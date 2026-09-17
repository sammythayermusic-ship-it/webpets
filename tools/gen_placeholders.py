"""Generate PLACEHOLDER art for the fish bowl (Phase 0).

Outputs (all stamped with a tiny bitmap "PLACEHOLDER" label):
  assets/habitats/fish/bowl/{medium,decor_back,pantry,pantry_fill,decor_front,glass,night,memorial}.png  (160x120)
  assets/sprites/fish/{idle,eat,hungry,sleep,dead}.png  (80x80 strips, 4/4/4/2/2 frames)

`bg` is the concept art `assets/habitats-160x120/fish-bowl.png` and is NOT regenerated.
The geometry below must match assets/manifest.json and src/species/fish/layout.ts.

Run: python3 tools/gen_placeholders.py
"""
from __future__ import annotations

import math
import os
from typing import Iterable

from PIL import Image, ImageDraw

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'assets')
BOWL_DIR = os.path.join(ASSETS, 'habitats', 'fish', 'bowl')
FISH_DIR = os.path.join(ASSETS, 'sprites', 'fish')
CONCEPT = os.path.join(ASSETS, 'habitats-160x120', 'fish-bowl.png')

GRID_W, GRID_H = 160, 120
FRAME = 80

# --- geometry (keep in sync with assets/manifest.json + src/species/fish/layout.ts) ---
WATER = dict(cx=81, cy=58, rx=40, ry=42, surfaceY=23, floorY=96)
PANTRY_RECT = dict(x=93, y=5, w=18, h=15)          # inner box of the clip-on feeder (fill lives here)
FEEDER_BOX = dict(x=92, y=4, w=20, h=17)           # outline of the feeder as drawn in the concept art
OPAQUE_RECT = dict(x=40, y=4, w=84, h=115)

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
FISH_ORANGE = (255, 140, 40, 255)
FISH_LIGHT = (255, 190, 90, 255)
FISH_DARK = (200, 90, 20, 255)
FISH_GRAY = (150, 150, 160, 255)
FISH_GRAY_DARK = (100, 100, 110, 255)
EYE_WHITE = (255, 255, 255, 255)
EYE_BLACK = (20, 20, 30, 255)

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


def stamp(im: Image.Image, x: int, y: int, text: str, color=STAMP, scale: int = 1) -> None:
    """Draw `text` with the 3x5 font at (x, y), `scale` px per font pixel."""
    px = im.load()
    for ch in text.upper():
        glyph = FONT.get(ch, FONT[' '])
        for gy, row in enumerate(glyph):
            for gx, bit in enumerate(row):
                if bit == '1':
                    for sy in range(scale):
                        for sx in range(scale):
                            xx, yy = x + gx * scale + sx, y + gy * scale + sy
                            if 0 <= xx < im.width and 0 <= yy < im.height:
                                px[xx, yy] = color
        x += 4 * scale


def new_layer() -> Image.Image:
    return Image.new('RGBA', (GRID_W, GRID_H), (0, 0, 0, 0))


def in_water(x: float, y: float) -> bool:
    if y < WATER['surfaceY'] or y > WATER['floorY']:
        return False
    dx = (x - WATER['cx']) / WATER['rx']
    dy = (y - WATER['cy']) / WATER['ry']
    return dx * dx + dy * dy <= 1.0


def label(im: Image.Image, name: str, y: int = 110) -> None:
    """Layer name + PLACEHOLDER stamp inside the opaque bowl area (bottom rows are the bowl base)."""
    stamp(im, 44, y, name)
    stamp(im, 44, y + 6, 'PLACEHOLDER')


# ----------------------------------------------------------------------------- habitat layers

# The concept render has a fish painted into the water. Until the layered art exists the `medium` layer
# heals that patch with opaque water sampled from the same row, so the live sprite is the only fish.
PAINTED_FISH_SEARCH = dict(x0=50, x1=93, y0=44, y1=74)


def painted_fish_box(concept: Image.Image) -> tuple[int, int, int, int] | None:
    px = concept.load()
    s = PAINTED_FISH_SEARCH
    xs, ys = [], []
    for y in range(s['y0'], s['y1']):
        for x in range(s['x0'], s['x1']):
            r, g, b, a = px[x, y]
            if a > 0 and in_water(x + 0.5, y + 0.5) and r > g + 30 and r > b + 30:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs) - 1, min(ys) - 1, max(xs) + 1, max(ys) + 1


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
    concept = Image.open(CONCEPT).convert('RGBA')
    box = painted_fish_box(concept)
    for y in range(GRID_H):
        for x in range(GRID_W):
            if in_water(x + 0.5, y + 0.5):
                # faint horizontal shimmer bands so the tint reads
                a = WATER_BLUE[3] + (12 if (y // 3) % 2 == 0 else 0)
                px[x, y] = (WATER_BLUE[0], WATER_BLUE[1], WATER_BLUE[2], a)
    if box is not None:
        x0, y0, x1, y1 = box
        for y in range(y0, y1 + 1):
            col = water_color_at_row(concept, y, x0 - 1)
            for x in range(x0, x1 + 1):
                if in_water(x + 0.5, y + 0.5):
                    px[x, y] = col
    stamp(im, 66, 62, 'MEDIUM')
    stamp(im, 66, 68, 'PLACEHOLDER')
    return im


def gen_decor_back() -> Image.Image:
    im = new_layer()
    d = ImageDraw.Draw(im)
    # a back plant: three stalks with leaves, rooted in the gravel on the left
    for i, (sx, h) in enumerate(((56, 30), (62, 40), (68, 34))):
        d.rectangle((sx, 90 - h, sx + 1, 90), fill=PLANT_DARK)
        for k in range(3):
            ly = 90 - h + 6 + k * 10
            d.rectangle((sx - 3, ly, sx + 4, ly + 2), fill=PLANT_GREEN)
    stamp(im, 50, 30, 'DECOR')
    stamp(im, 50, 36, 'BACK')
    stamp(im, 50, 42, 'PLACEHOLDER')
    return im


def gen_pantry() -> Image.Image:
    im = new_layer()
    d = ImageDraw.Draw(im)
    b = FEEDER_BOX
    # feeder box: dark opaque interior (hides the concept's painted flakes) + outline + clip down the rim
    d.rectangle((b['x'], b['y'], b['x'] + b['w'] - 1, b['y'] + b['h'] - 1), fill=(38, 42, 52, 255),
                outline=FEEDER_GRAY)
    d.rectangle((b['x'] + 16, b['y'] + b['h'], b['x'] + 19, b['y'] + b['h'] + 6), fill=FEEDER_GRAY)
    stamp(im, 125, 6, 'PANTRY')
    stamp(im, 125, 12, 'PH')
    return im


def gen_pantry_fill() -> Image.Image:
    im = new_layer()
    px = im.load()
    r = PANTRY_RECT
    for y in range(r['y'], r['y'] + r['h']):
        for x in range(r['x'], r['x'] + r['w']):
            px[x, y] = FLAKE_DARK if (x + y) % 3 == 0 else FLAKE_TAN
    stamp(im, r['x'] + 1, r['y'] + 5, 'FILL', color=(120, 60, 20, 255))
    return im


def gen_decor_front() -> Image.Image:
    im = new_layer()
    d = ImageDraw.Draw(im)
    # a small front plant on the right side of the gravel
    for sx, h in ((100, 18), (105, 24)):
        d.rectangle((sx, 94 - h, sx + 1, 94), fill=PLANT_DARK)
        for k in range(2):
            ly = 94 - h + 4 + k * 8
            d.rectangle((sx - 2, ly, sx + 3, ly + 1), fill=PLANT_GREEN)
    stamp(im, 96, 60, 'FRONT')
    stamp(im, 96, 66, 'PH')
    return im


def gen_glass() -> Image.Image:
    im = new_layer()
    px = im.load()
    # a faint specular streak along the upper-left inside of the glass
    for t in range(0, 40):
        ang = math.radians(150 + t)
        x = int(round(WATER['cx'] + (WATER['rx'] - 3) * math.cos(ang)))
        y = int(round(WATER['cy'] + (WATER['ry'] - 3) * math.sin(ang)))
        if 0 <= x < GRID_W and 0 <= y < GRID_H:
            px[x, y] = SHEEN
            px[x + 1, y] = SHEEN
    stamp(im, 44, 26, 'GLASS', color=(255, 255, 255, 140))
    stamp(im, 44, 32, 'PH', color=(255, 255, 255, 140))
    return im


def gen_night() -> Image.Image:
    im = new_layer()
    d = ImageDraw.Draw(im)
    o = OPAQUE_RECT
    d.rectangle((o['x'], o['y'], o['x'] + o['w'] - 1, o['y'] + o['h'] - 1), fill=NIGHT_BLUE)
    # the feeder/lamp area stays bright (white = unchanged under multiply)
    b = FEEDER_BOX
    d.rectangle((b['x'] - 2, b['y'] - 2, b['x'] + b['w'] + 1, b['y'] + b['h'] + 1), fill=WHITE)
    stamp(im, 44, 100, 'NIGHT', color=(200, 210, 255, 255))
    stamp(im, 44, 106, 'PLACEHOLDER', color=(200, 210, 255, 255))
    # Multiply over a transparent pixel yields opaque black (DST_COLOR * src + dst * (1 - srcA) with dst = 0,
    # alpha ONE * srcA), so the night layer must be transparent wherever the bowl itself is transparent.
    concept = Image.open(CONCEPT).convert('RGBA').load()
    px = im.load()
    for y in range(GRID_H):
        for x in range(GRID_W):
            if concept[x, y][3] == 0:
                px[x, y] = (0, 0, 0, 0)
    return im


def gen_memorial() -> Image.Image:
    im = Image.open(CONCEPT).convert('RGBA').copy()
    px = im.load()
    # empty the water: bluish pixels inside the water body become pale, near-transparent glass
    for y in range(WATER['surfaceY'], WATER['floorY'] + 1):
        for x in range(GRID_W):
            r, g, b, a = px[x, y]
            if a > 0 and in_water(x + 0.5, y + 0.5) and b > r + 20 and b > g:
                px[x, y] = (236, 242, 246, 120)
    # remove the painted fish as well (same patch the medium layer heals)
    box = painted_fish_box(Image.open(CONCEPT).convert('RGBA'))
    if box is not None:
        x0, y0, x1, y1 = box
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if in_water(x + 0.5, y + 0.5):
                    px[x, y] = (236, 242, 246, 120)
    # a tiny flag planted in the gravel
    d = ImageDraw.Draw(im)
    d.rectangle((84, 82, 84, 91), fill=(60, 50, 40, 255))
    d.polygon([(85, 82), (91, 84), (85, 87)], fill=(220, 50, 50, 255))
    stamp(im, 60, 40, 'MEMORIAL', color=(120, 120, 130, 255))
    stamp(im, 60, 46, 'PLACEHOLDER', color=(120, 120, 130, 255))
    return im


# ----------------------------------------------------------------------------- fish strips

def draw_fish(frame: Image.Image, ox: int, *, tail: int = 0, mouth: int = 0, droop: int = 0,
              eyes: str = 'open', belly_up: bool = False, gray: bool = False) -> None:
    """Draw one ~28x14 fish facing right, centered in an 80x80 frame at column offset `ox`.

    tail: -1/0/1 tail wag; mouth: 0..2 open amount; droop: extra px the head sinks; eyes: open|closed|x.
    """
    body = FISH_GRAY if gray else FISH_ORANGE
    light = FISH_GRAY_DARK if gray else FISH_LIGHT
    dark = FISH_GRAY_DARK if gray else FISH_DARK
    cx, cy = ox + FRAME // 2, FRAME // 2  # body center (40, 40) inside the frame
    d = ImageDraw.Draw(frame)
    # body: ellipse 20x12 centered slightly right of center (x 32..51 → head at right)
    bx0, by0 = cx - 8, cy - 6 + droop
    d.ellipse((bx0, by0, bx0 + 19, by0 + 11), fill=body, outline=dark)
    # belly highlight stripe
    d.rectangle((bx0 + 4, by0 + 7, bx0 + 14, by0 + 8), fill=light)
    # tail: a triangle pointing left, wagging up/down
    tx = bx0 - 1
    ty = cy + droop + tail * 2
    d.polygon([(tx, ty), (tx - 7, ty - 6 + tail), (tx - 7, ty + 6 + tail)], fill=body, outline=dark)
    # top fin
    d.polygon([(bx0 + 6, by0), (bx0 + 12, by0), (bx0 + 10, by0 - 3)], fill=dark)
    # eye
    ex, ey = bx0 + 14, by0 + 3
    if eyes == 'open':
        d.rectangle((ex, ey, ex + 1, ey + 1), fill=EYE_WHITE)
        d.point((ex + 1, ey + 1), fill=EYE_BLACK)
    elif eyes == 'closed':
        d.rectangle((ex, ey + 1, ex + 1, ey + 1), fill=EYE_BLACK)
    else:  # 'x'
        d.point((ex, ey), fill=EYE_BLACK)
        d.point((ex + 1, ey + 1), fill=EYE_BLACK)
        d.point((ex + 1, ey), fill=EYE_BLACK)
        d.point((ex, ey + 1), fill=EYE_BLACK)
    # mouth
    mx, my = bx0 + 19, by0 + 7
    if mouth == 0:
        d.point((mx, my), fill=dark)
    else:
        d.rectangle((mx - 1, my - mouth, mx + 1, my + mouth), fill=EYE_BLACK)
        d.point((mx + 1, my), fill=dark)
    if belly_up:
        # flip the whole frame region vertically around the body center
        region = frame.crop((ox, 0, ox + FRAME, FRAME)).transpose(Image.FLIP_TOP_BOTTOM)
        frame.paste(region, (ox, 0))


def strip(frames: int) -> Image.Image:
    return Image.new('RGBA', (FRAME * frames, FRAME), (0, 0, 0, 0))


def finish(im: Image.Image, frames: int) -> Image.Image:
    for i in range(frames):
        stamp(im, i * FRAME + 2, 2, 'PH', color=STAMP, scale=2)
    return im


def gen_idle() -> Image.Image:
    im = strip(4)
    for i, tail in enumerate((0, 1, 0, -1)):
        draw_fish(im, i * FRAME, tail=tail)
    return finish(im, 4)


def gen_eat() -> Image.Image:
    im = strip(4)
    for i, (tail, mouth) in enumerate(((0, 1), (1, 2), (0, 2), (-1, 0))):
        draw_fish(im, i * FRAME, tail=tail, mouth=mouth)
    return finish(im, 4)


def gen_hungry() -> Image.Image:
    im = strip(4)
    for i, (tail, droop) in enumerate(((0, 2), (1, 3), (0, 2), (-1, 3))):
        draw_fish(im, i * FRAME, tail=tail, droop=droop)
    return finish(im, 4)


def gen_sleep() -> Image.Image:
    im = strip(2)
    for i, droop in enumerate((0, 1)):
        draw_fish(im, i * FRAME, tail=0, droop=droop, eyes='closed')
    return finish(im, 2)


def gen_dead() -> Image.Image:
    im = strip(2)
    for i, tail in enumerate((0, 1)):
        draw_fish(im, i * FRAME, tail=tail, eyes='x', belly_up=True, gray=True)
    return finish(im, 2)


# ----------------------------------------------------------------------------- main

def save(im: Image.Image, path: str, size: tuple[int, int]) -> None:
    assert im.size == size, f'{path}: {im.size} != {size}'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)
    print('wrote', os.path.relpath(path, ROOT), im.size)


def check_pantry_fill(im: Image.Image) -> None:
    px = im.load()
    r = PANTRY_RECT
    for y in range(GRID_H):
        for x in range(GRID_W):
            if px[x, y][3] > 0:
                assert r['x'] <= x < r['x'] + r['w'] and r['y'] <= y < r['y'] + r['h'], \
                    f'pantry_fill opaque pixel outside pantryRect at {x},{y}'


def main(argv: Iterable[str] = ()) -> None:
    del argv
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
    check_pantry_fill(layers['pantry_fill'])
    for name, im in layers.items():
        save(im, os.path.join(BOWL_DIR, f'{name}.png'), (GRID_W, GRID_H))
    strips = {
        'idle': (gen_idle(), 4),
        'eat': (gen_eat(), 4),
        'hungry': (gen_hungry(), 4),
        'sleep': (gen_sleep(), 2),
        'dead': (gen_dead(), 2),
    }
    for name, (im, n) in strips.items():
        save(im, os.path.join(FISH_DIR, f'{name}.png'), (FRAME * n, FRAME))


if __name__ == '__main__':
    import sys
    main(sys.argv[1:])
