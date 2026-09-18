"""Build the fish sprite strips from the goldfish painted into the concept render.

This is real art, not placeholder geometry. The hi-res reference
`assets/reference/habitats-hires/fish-bowl.png` contains a fully drawn goldfish; it is segmented out,
downscaled to the drawn size the manifest implies, quantized to the warm half of the shipped palette and
then *transformed* into animation frames. Every frame of every state comes from that one source image, so
the fish is the same fish in every pose.

Segmentation (verified): crop the reference at (400, 330, 760, 575), classify water as
`a < 200 or (b > r + 25 and b > 90 and g < b + 10)`, flood the water in from the crop border, and take the
largest connected non-water component. A plain bounding-box crop keeps the water, the bubbles and the
plant; the flood is what makes it a clean cut-out. The result is 214x161 with fins, tail, shading and eye
intact.

Palette: the bowl's 38 shipped colours are mostly water blues, and quantizing an isolated fish against
them speckles the pale fin highlights with teal. The sprite therefore uses the WARM half of that palette
(every entry with b <= r: black, five browns, two oranges, tan) plus the near-white the painted fish uses
for its eye and belly -- eleven colours, all of them the bowl's own. `dead` is the exception: it is
desaturated first and quantized against the full palette, which is what drains the colour out of it.

Frames are laid out on ONE horizontal row of `sprites.fish.frame` cells, which is what
`src/render/spritePlayer.ts` reads. `happy`, `excited` and `curious` are generated now even though
`PetAnim` does not reference them yet; declaring them costs a manifest entry and saves a second art pass.

Also writes `assets/sprites/fish/emotes.png`: a 6-frame 16x16 overlay strip (heart, note, zzz, sweat,
exclamation, question) for a later stage to hang above the body.

Run: python3 tools/gen_fish.py [--frame W H] [--drawn N] [--report]
"""
from __future__ import annotations

import argparse
import json
import math
import os
from collections import deque
from typing import Callable, Iterable, Sequence

from PIL import Image

import gen_bg

ROOT = gen_bg.ROOT
ASSETS = gen_bg.ASSETS
MANIFEST = gen_bg.MANIFEST
REFERENCE = gen_bg.REFERENCE
FISH_DIR = os.path.join(ASSETS, 'sprites', 'fish')

#: Where the goldfish sits in the 1168x880 reference, and the predicate that separates it from the water.
FISH_CROP = (400, 330, 760, 575)

Rgb = tuple[int, int, int]


# ------------------------------------------------------------------------------ source segmentation

def is_water(c: Sequence[int]) -> bool:
    r, g, b, a = c
    return a < 200 or (b > r + 25 and b > 90 and g < b + 10)


def segment_fish() -> Image.Image:
    """Cut the goldfish out of the reference: flood the water in from the border, keep the largest island."""
    crop = Image.open(REFERENCE).convert('RGBA').crop(FISH_CROP)
    w, h = crop.size
    px = crop.load()
    water = [[is_water(px[x, y]) for x in range(w)] for y in range(h)]

    flooded = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        if water[y][x] and not flooded[y][x]:
            flooded[y][x] = True
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                push(nx, ny)

    seen = [[False] * w for _ in range(h)]
    best: list[tuple[int, int]] = []
    for sy in range(h):
        for sx in range(w):
            if flooded[sy][sx] or seen[sy][sx]:
                continue
            comp: list[tuple[int, int]] = []
            seen[sy][sx] = True
            stack = [(sx, sy)]
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not flooded[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    if not best:
        raise SystemExit('fish segmentation found nothing')
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()
    for x, y in best:
        op[x, y] = (*px[x, y][:3], 255)
    box = out.getchannel('A').getbbox()
    assert box is not None
    return out.crop(box)


def warm_palette(full: Sequence[Rgb]) -> list[Rgb]:
    """The bowl palette's warm half plus its near-white; the colours the painted fish is actually made of."""
    warm = [c for c in full if c[2] <= c[0]]
    light = max(full, key=gen_bg.luma)
    return sorted(set(warm) | {light}, key=gen_bg.luma)


def despeckle_highlights(im: Image.Image, palette: Sequence[Rgb]) -> int:
    """Demote lone highlight pixels one step down the ramp; scattered single whites read as noise."""
    px = im.load()
    w, h = im.size
    hi, second = palette[-1], palette[-2]
    lone = [(x, y) for y in range(h) for x in range(w)
            if px[x, y][3] > 0 and px[x, y][:3] == hi and not any(
                0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][:3] == hi
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in lone:
        px[x, y] = (*second, 255)
    return len(lone)


# ------------------------------------------------------------------------------ features

class Fish:
    """The base sprite pasted into one frame cell, plus the feature positions the poses need."""

    def __init__(self, frame: Image.Image, box: tuple[int, int, int, int], palette: Sequence[Rgb]):
        self.frame = frame
        self.x0, self.y0, self.x1, self.y1 = box  # inclusive drawn bounds inside the frame
        self.palette = list(palette)
        px = frame.load()
        dark = set(self.palette[:2])
        head_from = self.x0 + int((self.x1 - self.x0) * 0.68)
        pupil = [(x, y) for y in range(self.y0, self.y1 + 1) for x in range(head_from, self.x1 + 1)
                 if px[x, y][3] > 0 and px[x, y][:3] in dark]
        if not pupil:
            raise SystemExit('could not find the eye in the base sprite')
        self.eye = (min(p[0] for p in pupil), min(p[1] for p in pupil),
                    max(p[0] for p in pupil), max(p[1] for p in pupil))
        rows = [(y, max(x for x in range(self.x0, self.x1 + 1) if px[x, y][3] > 0))
                for y in range(self.y0, self.y1 + 1)
                if any(px[x, y][3] > 0 for x in range(self.x0, self.x1 + 1))]
        self.snout_x = max(r[1] for r in rows)
        snout_rows = [y for y, x in rows if x >= self.snout_x - 1]
        self.snout_y = max(snout_rows)

    @property
    def width(self) -> int:
        return self.x1 - self.x0 + 1

    @property
    def height(self) -> int:
        return self.y1 - self.y0 + 1


# ------------------------------------------------------------------------------ frame transforms

def shear_columns(im: Image.Image, dy: Callable[[float], int]) -> Image.Image:
    """Displace each column vertically. Integer shifts only, so the pixel grid survives."""
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    for x in range(im.width):
        col = im.crop((x, 0, x + 1, im.height))
        out.paste(col, (x, dy(x)))
    return out


def translate(im: Image.Image, dx: int, dy: int) -> Image.Image:
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (dx, dy))
    return out


def tail_wag(fish: Fish, phase: float, amp: float, waves: float = 1.0) -> Callable[[float], int]:
    """A travelling wave that dies out at the head: the tail swings, the snout barely moves."""
    span = max(1, fish.width - 1)

    def dy(x: float) -> int:
        t = (x - fish.x0) / span              # 0 at the tail tip, 1 at the snout
        falloff = (1 - t) ** 2
        return int(round(amp * falloff * math.sin(2 * math.pi * (phase - waves * t))))

    return dy


def tilt(fish: Fish, slope: float) -> Callable[[float], int]:
    """Lean the whole body; positive slope drops the head."""
    mid = (fish.x0 + fish.x1) / 2
    return lambda x: int(round(slope * (x - mid)))


def combine(*fns: Callable[[float], int]) -> Callable[[float], int]:
    return lambda x: sum(fn(x) for fn in fns)


# ------------------------------------------------------------------------------ pose edits

def close_eye(im: Image.Image, fish: Fish, dy: int = 0) -> None:
    """Paint a lid line over the pupil. Cheapest legible 'asleep'."""
    px = im.load()
    x0, y0, x1, y1 = fish.eye
    lid = fish.palette[1]
    mid = (y0 + y1) // 2 + dy
    for y in range(y0 + dy, y1 + 1 + dy):
        for x in range(x0 - 1, x1 + 2):
            if 0 <= x < im.width and 0 <= y < im.height and px[x, y][3] > 0:
                px[x, y] = (*(lid if y == mid else fish.palette[-1]), 255)


def widen_eye(im: Image.Image, fish: Fish, dy: int = 0) -> None:
    """Brighten the sclera on the forward side and above the pupil so the eye reads as wide open.

    Ringing the pupil on all four sides turns it into a googly cartoon eye at this size; lighting only
    the side the fish is looking toward keeps it a goldfish.
    """
    px = im.load()
    x0, y0, x1, y1 = fish.eye
    light = fish.palette[-1]
    cells = [(x, y0 - 1 + dy) for x in range(x0, x1 + 1)] + [(x1 + 1, y) for y in range(y0 + dy, y1 + 1 + dy)]
    for x, y in cells:
        if 0 <= x < im.width and 0 <= y < im.height and px[x, y][3] > 0:
            px[x, y] = (*light, 255)


def open_mouth(im: Image.Image, fish: Fish, amount: int, dy: int = 0) -> None:
    """Cut a dark wedge into the snout tip: widest at the lip, tapering back. `amount` px of gape."""
    if amount <= 0:
        return
    px = im.load()
    dark = fish.palette[0]
    lip_x, lip_y = fish.snout_x, fish.snout_y - 1 + dy
    for back in range(amount + 1):
        x = lip_x - back
        half = amount - back
        for y in range(lip_y - half, lip_y + half + 1):
            if 0 <= x < im.width and 0 <= y < im.height and px[x, y][3] > 0:
                px[x, y] = (*dark, 255)


def droop_fins(im: Image.Image, fish: Fish, amount: int) -> Image.Image:
    """Sag everything below the body's midline; the clearest 'unwell' signal at this size.

    Implemented as a per-column vertical *resample* (`out[y] = src[y - shift(y)]` with a monotone shift)
    rather than a copy-and-clear: moving pixels down one at a time tears a transparent seam across the
    body at the row where the shift first reaches 1.
    """
    if amount <= 0:
        return im
    out = im.copy()
    px = im.load()
    op = out.load()
    mid = (fish.y0 + fish.y1) // 2 + 2
    span = max(1, fish.y1 - mid)
    for y in range(im.height - 1, mid - 1, -1):
        shift = min(amount, int(round(amount * (y - mid) / span)))
        src_y = max(mid, y - shift)
        for x in range(im.width):
            op[x, y] = px[x, src_y]
    return out


def desaturate(im: Image.Image, full_palette: Sequence[Rgb], keep: float = 0.15) -> Image.Image:
    """Drain the colour and re-quantize against the whole bowl palette, which owns the greys."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            v = gen_bg.luma((r, g, b))
            grey = (v * (1 - keep) + r * keep, v * (1 - keep) + g * keep, v * (1 - keep) + b * keep)
            near = min(full_palette, key=lambda c: sum((c[i] - grey[i]) ** 2 for i in range(3)))
            px[x, y] = (*near, 255)
    return out


def flip_body(im: Image.Image) -> Image.Image:
    return im.transpose(Image.FLIP_TOP_BOTTOM)


# ------------------------------------------------------------------------------ states

def build_states(fish: Fish, full_palette: Sequence[Rgb]) -> dict[str, list[Image.Image]]:
    base = fish.frame

    def pose(*, wag: tuple[float, float, float] | None = None, lean: float = 0.0,
             dy: int = 0, dx: int = 0, droop: int = 0) -> Image.Image:
        im = base
        fns: list[Callable[[float], int]] = []
        if wag:
            fns.append(tail_wag(fish, wag[0], wag[1], wag[2]))
        if lean:
            fns.append(tilt(fish, lean))
        if fns:
            im = shear_columns(im, combine(*fns))
        if droop:
            im = droop_fins(im, fish, droop)
        if dx or dy:
            im = translate(im, dx, dy)
        return im

    states: dict[str, list[Image.Image]] = {}

    # idle: a four-step tail wag plus two blink variants of it
    idle = [pose(wag=(i / 4, 2.0, 0.8)) for i in range(4)]
    for src, phase in ((0, 0), (2, 2)):
        blink = idle[src].copy()
        close_eye(blink, fish, dy=int(round(tail_wag(fish, phase / 4, 2.0, 0.8)(fish.eye[0]))))
        idle.append(blink)
    states['idle'] = idle

    # eat: lunge forward, gape twice, gulp, settle back
    eat = []
    for ph, dx, mouth in ((0.0, 1, 1), (0.25, 2, 2), (0.5, 2, 2), (0.75, 1, 1), (0.0, 0, 0)):
        im = pose(wag=(ph, 2.5, 0.8), dx=dx)
        open_mouth(im, fish, mouth, dy=tail_wag(fish, ph, 2.5, 0.8)(fish.snout_x))
        eat.append(im)
    states['eat'] = eat

    # hungry: head down, fins drooping, a slow tired wag
    states['hungry'] = [pose(wag=(i / 5, 0.8, 0.6), lean=0.22, dy=1, droop=3 + (i % 2)) for i in range(5)]

    # sleep: closed eyes, nose down, a barely-there drift
    sleep = []
    for i, d in enumerate((0, 0, 1, 1)):
        im = pose(wag=(i / 8, 0.7, 0.5), lean=0.10, dy=d, droop=1)
        close_eye(im, fish, dy=d + tilt(fish, 0.10)(fish.eye[0]))
        sleep.append(im)
    states['sleep'] = sleep

    # dead: belly up, colour drained, drifting
    dead = []
    for i, d in enumerate((0, 1, 1, 0)):
        im = flip_body(pose(wag=(i / 4, 1.2, 0.5)))
        im = desaturate(im, full_palette)
        dead.append(translate(im, 0, d))
    states['dead'] = dead

    # happy: wide tail arc, nose up, fins spread
    states['happy'] = [pose(wag=(i / 5, 3.0, 0.9), lean=-0.10) for i in range(5)]

    # excited: fast, high-amplitude wag with a body arch
    states['excited'] = [pose(wag=(i / 3, 3.5, 1.4), dy=(-1 if i % 2 else 1)) for i in range(6)]

    # curious: head forward, eye wide, tail almost still
    curious = []
    for i in range(4):
        im = pose(wag=(i / 8, 1.0, 0.6), dx=1 if i >= 2 else 0)
        widen_eye(im, fish, dy=0)
        curious.append(im)
    states['curious'] = curious

    return states


#: Sequences for the manifest. Kept here so the art and the timing are authored together.
SEQUENCES: dict[str, dict[str, object]] = {
    'idle': {'sequence': [0, 1, 2, 3, 0, 1, 2, 3, 4, 0, 1, 2, 3, 5], 'loop': True},
    'eat': {'sequence': [0, 1, 2, 3, 4], 'loop': False, 'returnTo': 'idle'},
    'hungry': {'sequence': [0, 0, 1, 1, 2, 2, 3, 3, 4, 4], 'loop': True},
    'sleep': {'sequence': [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3], 'loop': True},
    'dead': {'sequence': [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3], 'loop': True},
    'happy': {'sequence': [0, 1, 2, 3, 4], 'loop': True},
    'excited': {'sequence': [0, 1, 2, 3, 4, 5], 'loop': True},
    'curious': {'sequence': [0, 1, 2, 3, 2, 1], 'loop': True},
}


# ------------------------------------------------------------------------------ emotes

#: 16x16 overlay glyphs. '.' transparent, 'o' outline, 'f' fill, 'a' accent.
EMOTES: list[tuple[str, tuple[str, ...]]] = [
    ('heart', (
        '................', '...oo.....oo....', '..oaaoo.ooaao...', '.oaaaaoaaaaaao..',
        '.oaffaaaaaaaaao.', '.oaffaaaaaaaaao.', '.oaaaaaaaaaaaao.', '..oaaaaaaaaaao..',
        '...oaaaaaaaaao..', '....oaaaaaaao...', '.....oaaaaao....', '......oaaao.....',
        '.......oao......', '........o.......', '................', '................')),
    ('note', (
        '................', '........oooooo..', '.......offfffo..', '.......offfffo..',
        '.......offfffo..', '.......ofoofffo.', '.......ofo.offo.', '.......ofo..oo..',
        '.......ofo......', '.......ofo......', '.....oofoo......', '....offffo......',
        '....offffo......', '....offffo......', '.....oooo.......', '................')),
    # Three Zs climbing to the right. Drawn as bare strokes: at 5x5 a Z with an outline and a fill is a
    # blob, and the diagonal is the whole letter.
    ('zzz', (
        '...........ooooo', '..............o.', '.............o..', '............o...',
        '...........ooooo', '......ooooo.....', '.........o......', '........o.......',
        '.......o........', '......ooooo.....', '.ooooo..........', '....o...........',
        '...o............', '..o.............', '.ooooo..........', '................')),
    ('sweat', (
        '................', '.......oo.......', '.......oo.......', '......oaao......',
        '......oaao......', '.....oaaaao.....', '.....oaaaao.....', '....oaffaaao....',
        '....oaffaaao....', '...oaffaaaaao...', '...oaffaaaaao...', '...oaaaaaaaao...',
        '....oaaaaaao....', '.....oooooo.....', '................', '................')),
    ('excl', (
        '................', '......oooo......', '.....offffo.....', '.....offffo.....',
        '.....offffo.....', '.....offffo.....', '.....offffo.....', '.....offffo.....',
        '.....offffo.....', '......oooo......', '................', '......oooo......',
        '.....offffo.....', '.....offffo.....', '......oooo......', '................')),
    ('question', (
        '................', '.....oooo.......', '....offffoo.....', '...offooffo.....',
        '...offo.offo....', '...ooo..offo....', '........offo....', '.......offo.....',
        '......offo......', '......offo......', '......oo........', '................',
        '......oooo......', '.....offffo.....', '.....offffo.....', '......oooo......')),
]

EMOTE_COLOURS: dict[str, tuple[Rgb, Rgb, Rgb]] = {
    # (outline, fill, accent)
    'heart': ((39, 13, 11), (243, 249, 251), (227, 112, 44)),
    'note': ((21, 13, 22), (243, 249, 251), (243, 249, 251)),
    'zzz': ((24, 39, 70), (200, 234, 250), (200, 234, 250)),  # bare navy strokes, the bowl's own outline colour
    'sweat': ((13, 65, 114), (243, 249, 251), (132, 205, 246)),
    'excl': ((39, 13, 11), (243, 249, 251), (243, 249, 251)),
    'question': ((39, 13, 11), (243, 249, 251), (243, 249, 251)),
}
EMOTE_SIZE = 16


def gen_emotes() -> Image.Image:
    im = Image.new('RGBA', (EMOTE_SIZE * len(EMOTES), EMOTE_SIZE), (0, 0, 0, 0))
    px = im.load()
    for i, (name, rows) in enumerate(EMOTES):
        outline_c, fill_c, accent_c = EMOTE_COLOURS[name]
        if len(rows) != EMOTE_SIZE:
            raise SystemExit(f'emote {name}: {len(rows)} rows, expected {EMOTE_SIZE}')
        for y, row in enumerate(rows):
            if len(row) != EMOTE_SIZE:
                raise SystemExit(f'emote {name} row {y}: {len(row)} cols, expected {EMOTE_SIZE}')
            for x, ch in enumerate(row):
                if ch == '.':
                    continue
                c = {'o': outline_c, 'f': fill_c, 'a': accent_c}[ch]
                px[i * EMOTE_SIZE + x, y] = (*c, 255)
    return im


# ------------------------------------------------------------------------------ main

def load_manifest_sizes(frame: tuple[int, int] | None, drawn: int | None) -> tuple[tuple[int, int], int]:
    with open(MANIFEST, encoding='utf8') as fh:
        manifest = json.load(fh)
    fish = manifest['sprites']['fish']
    fw, fh_ = frame if frame else (int(fish['frame'][0]), int(fish['frame'][1]))
    # The drawn fish is 40% of the frame: 64px in a 160px cell, which is the proportion the painted fish
    # has to the bowl in the concept render.
    return (fw, fh_), drawn if drawn else int(round(fw * 0.4))


def build(frame_size: tuple[int, int], drawn_w: int) -> tuple[dict[str, list[Image.Image]], Fish, dict[str, object]]:
    fw, fh_ = frame_size
    src = segment_fish()
    full = gen_bg.shipped_palette()
    warm = warm_palette(full)
    drawn_h = int(round(drawn_w * src.height / src.width))
    print(f'source goldfish {src.width}x{src.height} -> drawn {drawn_w}x{drawn_h} in a {fw}x{fh_} frame')
    small = gen_bg.downscale(src, (drawn_w, drawn_h))
    small = gen_bg.harden_alpha(small, 128)
    small = gen_bg.quantize(small, warm, 'none')
    small = gen_bg.outline(small, warm, 'darken')
    demoted = despeckle_highlights(small, warm)
    print(f'  palette: {len(warm)} warm colours from the bowl palette; demoted {demoted} lone highlight(s)')

    cell = Image.new('RGBA', (fw, fh_), (0, 0, 0, 0))
    ox, oy = (fw - drawn_w) // 2, (fh_ - drawn_h) // 2
    cell.paste(small, (ox, oy))
    fish = Fish(cell, (ox, oy, ox + drawn_w - 1, oy + drawn_h - 1), warm)
    print(f'  features: eye {fish.eye}, snout ({fish.snout_x}, {fish.snout_y}), '
          f'drawn box x{fish.x0} y{fish.y0} w{fish.width} h{fish.height}')

    states = build_states(fish, full)
    info = {'drawn': [drawn_w, drawn_h], 'frame': [fw, fh_], 'eye': list(fish.eye),
            'states': {k: len(v) for k, v in states.items()}}
    return states, fish, info


def content_box(strip: Image.Image, fw: int, fh_: int, frames: int) -> dict[str, int]:
    """Union of every frame's opaque bbox, expressed as a body-centred w/h (anchor 0.5)."""
    px = strip.load()
    dx = dy = 0
    for f in range(frames):
        for y in range(fh_):
            for x in range(f * fw, (f + 1) * fw):
                if px[x, y][3] == 0:
                    continue
                dx = max(dx, abs(x % fw + 0.5 - fw / 2))
                dy = max(dy, abs(y + 0.5 - fh_ / 2))
    return {'w': int(math.ceil(dx * 2)), 'h': int(math.ceil(dy * 2))}


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--frame', nargs=2, type=int, metavar=('W', 'H'))
    p.add_argument('--drawn', type=int, metavar='N', help='drawn fish width in px (default: 40%% of frame)')
    p.add_argument('--out-dir', default=FISH_DIR)
    p.add_argument('--report', action='store_true', help='print the manifest block the strips imply')
    return p.parse_args(list(argv))


def main(argv: Iterable[str] = ()) -> None:
    args = parse_args(argv)
    frame_size, drawn_w = load_manifest_sizes(
        (args.frame[0], args.frame[1]) if args.frame else None, args.drawn)
    fw, fh_ = frame_size
    states, _fish, info = build(frame_size, drawn_w)

    os.makedirs(args.out_dir, exist_ok=True)
    boxes: dict[str, dict[str, int]] = {}
    for name, frames in states.items():
        strip = Image.new('RGBA', (fw * len(frames), fh_), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            strip.paste(f, (i * fw, 0))
        path = os.path.join(args.out_dir, f'{name}.png')
        strip.save(path)
        boxes[name] = content_box(strip, fw, fh_, len(frames))
        print(f'wrote {os.path.relpath(path, ROOT)} {strip.size} ({len(frames)} frames, '
              f'content {boxes[name]["w"]}x{boxes[name]["h"]})')

    emotes = gen_emotes()
    epath = os.path.join(args.out_dir, 'emotes.png')
    emotes.save(epath)
    print(f'wrote {os.path.relpath(epath, ROOT)} {emotes.size} ({len(EMOTES)} frames of {EMOTE_SIZE}px)')

    if args.report:
        widest = max(b['w'] for b in boxes.values())
        tallest = max(b['h'] for b in boxes.values())
        print()
        print('=== sprite report ===')
        print(f'drawn fish        {info["drawn"][0]}x{info["drawn"][1]}')
        print(f'widest content    {widest}x{tallest} (union over every frame of every state)')
        for name in sorted(boxes):
            print(f'  {name:<9} {len(states[name])} frames, content {boxes[name]["w"]}x{boxes[name]["h"]}')
        print()
        print('manifest sprites.fish.states:')
        for name in states:
            seq = SEQUENCES[name]
            extra = f', "returnTo": "{seq["returnTo"]}"' if 'returnTo' in seq else ''
            print(f'  "{name}": {{ "file": "sprites/fish/{name}.png", "frames": {len(states[name])}, '
                  f'"sequence": {json.dumps(seq["sequence"])}, "loop": {json.dumps(seq["loop"])}{extra} }},')
        print('=== end report ===')


if __name__ == '__main__':
    import sys
    main(sys.argv[1:])
