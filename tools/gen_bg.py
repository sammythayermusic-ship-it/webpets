"""Derive the fish bowl `bg` layer at the habitat grid from the hi-res concept render.

Stage 2. The 160x120 art that shipped in Phase 0 was made by downscaling
`assets/reference/habitats-hires/fish-bowl.png` and quantizing it to 38 opaque colours. This script does
the same thing at the manifest's grid, so the result is *the same art with more detail* rather than a
different-looking image:

  1. Centre-crop the reference to the grid's aspect BEFORE resizing. The reference is 1168x880 (1.3273)
     and the grid is 4:3 (1.3333); resizing straight across would apply a silent 0.45% horizontal
     stretch. Cropping 2 rows off the top and bottom is visible in a diff and costs nothing.
  2. Downscale with LANCZOS on premultiplied RGBA. NEAREST at a 3.65x reduction aliases the thin bowl
     rim out of existence; premultiplying stops the transparent-black surround bleeding into the edge.
  3. Hard alpha: threshold to 0/255 and despeckle. Soft alpha produces visible halos when the grid is
     nearest-upscaled 3x at size L.
  4. Quantize to the palette of the shipped 160x120 art (38 opaque colours), dither=NONE. The palette is
     the art's identity. Floyd-Steinberg scatters single-pixel speckle across the flat water that reads
     as JPEG noise; flat banding reads as deliberate. `--dither fs` exists so the choice can be re-made
     by eye, but NONE is what ships.
  5. Re-darken the 1px alpha boundary. The shipped 160x120 art has a dark outline on every silhouette
     pixel (median luminance 25, max 105) which the downscale softens; restoring it is the single
     cheapest thing that makes a downsampled render read as pixel art rather than a small photograph.
     The default mode `darken` scales each boundary pixel toward black and re-snaps it to the palette,
     which reproduces the source art's *contextual* outline (dark brown on the stand, dark navy on the
     glass). `--outline darkest` uses one global darkest colour instead; it reads as a sticker.

The script then measures the art it just wrote and prints the numbers `assets/manifest.json` and
`src/species/fish/layout.ts` must carry: the alpha bbox (-> opaqueRect), the water band and its per-row
extents (-> water, waterShape) and the feeder's inner window (-> pantryRect). `--json PATH` writes the
same report as JSON. Nothing from `assets/reference/` is ever shipped; it is the source, not an asset.

Run: python3 tools/gen_bg.py [--dither none|fs] [--outline darken|darkest|none]
                             [--alpha-threshold N] [--json PATH] [--report-only]
"""
from __future__ import annotations

import argparse
import json
import math
import os
from collections import deque
from typing import Iterable, Sequence

from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'assets')
MANIFEST = os.path.join(ASSETS, 'manifest.json')
REFERENCE = os.path.join(ASSETS, 'reference', 'habitats-hires', 'fish-bowl.png')
#: The shipped Phase 0 art. Used ONLY as the palette source; none of its pixels reach the output.
PALETTE_SRC = os.path.join(ASSETS, 'habitats-160x120', 'fish-bowl.png')
OUT = os.path.join(ASSETS, 'habitats', 'fish', 'bowl', 'bg.png')

Rgb = tuple[int, int, int]


# --------------------------------------------------------------------------------- manifest / palette

def habitat_grid() -> tuple[int, int]:
    with open(MANIFEST, encoding='utf8') as fh:
        manifest = json.load(fh)
    grid = manifest['habitats']['fish/bowl']['grid']
    return int(grid[0]), int(grid[1])


def shipped_palette() -> list[Rgb]:
    """The opaque RGB values of the shipped 160x120 art, darkest first."""
    im = Image.open(PALETTE_SRC).convert('RGBA')
    seen = {px[:3] for px in im.getdata() if px[3] > 0}
    return sorted(seen, key=luma)


def luma(c: Sequence[int]) -> float:
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


# --------------------------------------------------------------------------------- pipeline steps

def aspect_crop(im: Image.Image, grid: tuple[int, int]) -> tuple[Image.Image, str]:
    """Centre-crop to the grid's aspect so the resize is uniform in x and y."""
    gw, gh = grid
    want = gw / gh
    have = im.width / im.height
    if abs(want - have) < 1e-9:
        return im, f'no crop needed ({im.width}x{im.height} is already {want:.4f})'
    if have > want:  # too wide: trim columns
        w = int(round(im.height * want))
        left = (im.width - w) // 2
        box = (left, 0, left + w, im.height)
    else:  # too tall: trim rows
        h = int(round(im.width / want))
        top = (im.height - h) // 2
        box = (0, top, im.width, top + h)
    out = im.crop(box)
    return out, (f'{im.width}x{im.height} ({have:.4f}) centre-cropped to {out.width}x{out.height} '
                 f'({out.width / out.height:.4f}) to match the grid aspect {want:.4f}; '
                 f'the alternative is a {abs(want / have - 1) * 100:.2f}% silent stretch')


def downscale(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    """LANCZOS on premultiplied RGBA, so the transparent surround does not darken the silhouette edge."""
    r, g, b, a = im.split()
    pm = [Image.frombytes('L', im.size, bytes((c * al + 127) // 255 for c, al in zip(ch.tobytes(), a.tobytes())))
          for ch in (r, g, b)]
    small_a = a.resize(size, Image.LANCZOS)
    small = [ch.resize(size, Image.LANCZOS) for ch in pm]
    ab = small_a.tobytes()
    out = [Image.frombytes('L', size, bytes(min(255, (c * 255 + al // 2) // al) if al else 0
                                            for c, al in zip(ch.tobytes(), ab)))
           for ch in small]
    return Image.merge('RGBA', (out[0], out[1], out[2], small_a))


def harden_alpha(im: Image.Image, threshold: int) -> Image.Image:
    """Binarize alpha, then drop single stray pixels and fill single holes (4-connected)."""
    w, h = im.size
    px = im.load()
    solid = [[px[x, y][3] >= threshold for x in range(w)] for y in range(h)]

    def neighbours(x: int, y: int) -> int:
        n = 0
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and solid[ny][nx]:
                n += 1
        return n

    speckles = holes = 0
    for y in range(h):
        for x in range(w):
            if solid[y][x] and neighbours(x, y) == 0:
                solid[y][x] = False
                speckles += 1
            elif not solid[y][x] and neighbours(x, y) == 4:
                solid[y][x] = True
                holes += 1
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            px[x, y] = (r, g, b, 255) if solid[y][x] else (0, 0, 0, 0)
    print(f'  alpha: threshold {threshold} -> binary; removed {speckles} stray pixel(s), '
          f'filled {holes} single hole(s)')
    return im


def quantize(im: Image.Image, palette: Sequence[Rgb], dither: str) -> Image.Image:
    """Snap every opaque pixel to `palette` (transparent pixels are zeroed, matching the shipped art)."""
    pal = Image.new('P', (1, 1))
    flat: list[int] = []
    for c in palette:
        flat.extend(c)
    flat.extend([0, 0, 0] * (256 - len(palette)))
    pal.putpalette(flat)
    mode = Image.FLOYDSTEINBERG if dither == 'fs' else Image.NONE
    rgb = im.convert('RGB').quantize(palette=pal, dither=mode).convert('RGB')
    out = Image.merge('RGBA', (*rgb.split(), im.getchannel('A')))
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            if px[x, y][3] == 0:
                px[x, y] = (0, 0, 0, 0)
    return out


def outline(im: Image.Image, palette: Sequence[Rgb], mode: str, factor: float = 0.55) -> Image.Image:
    """Darken the 1px alpha boundary back to the outline the shipped art has on every silhouette pixel."""
    if mode == 'none':
        return im
    w, h = im.size
    px = im.load()
    darkest = palette[0]
    edge = [(x, y) for y in range(h) for x in range(w)
            if px[x, y][3] > 0 and any(
                not (0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] > 0)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    changed = 0
    for x, y in edge:
        r, g, b, _ = px[x, y]
        if mode == 'darkest':
            new = darkest
        else:
            target = (r * factor, g * factor, b * factor)
            new = min(palette, key=lambda c: sum((c[i] - target[i]) ** 2 for i in range(3)))
        if new != (r, g, b):
            changed += 1
        px[x, y] = (*new, 255)
    print(f'  outline: {mode} on {len(edge)} boundary pixel(s), {changed} recoloured')
    return im


# --------------------------------------------------------------------------------- measurement

def alpha_bbox(im: Image.Image) -> dict[str, int]:
    box = im.getchannel('A').point(lambda v: 255 if v else 0).getbbox()
    if box is None:
        raise SystemExit('the generated bg is fully transparent')
    x0, y0, x1, y1 = box
    return {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0}


def is_water(c: Sequence[int]) -> bool:
    """The predicate the Phase 0 measurement used: opaque, clearly blue, not the pale glass highlight."""
    r, g, b, a = c
    return a > 200 and b > 120 and b > r + 30 and b >= g - 10


def water_rows(im: Image.Image) -> list[tuple[int, int, int]]:
    """(y, x_min, x_max) for every row holding water pixels, contiguous band only."""
    w, h = im.size
    px = im.load()
    rows: list[tuple[int, int, int]] = []
    for y in range(h):
        xs = [x for x in range(w) if is_water(px[x, y])]
        if xs:
            rows.append((y, min(xs), max(xs)))
    if not rows:
        raise SystemExit('no water pixels found')
    # keep the longest run of consecutive rows (guards against a stray blue pixel in the feeder)
    best: list[tuple[int, int, int]] = []
    run: list[tuple[int, int, int]] = []
    for row in rows:
        if run and row[0] != run[-1][0] + 1:
            best = max(best, run, key=len)
            run = []
        run.append(row)
    best = max(best, run, key=len)
    return best


def fit_ellipse(rows: Sequence[tuple[int, int, int]]) -> dict[str, float]:
    """Fit the bowl's glass ellipse to the water band.

    `surfaceY`/`floorY` clip the ellipse, and the band narrows sharply at both ends where the bowl's rim
    and the gravel cut in, so the fit uses the body of the band (skipping the top 12% and bottom 8%).
    Half-widths are median-smoothed over five rows first: a single bright glass highlight can fail the
    water predicate and pinch one row by 8px, and an unsmoothed containment pass would then shrink the
    whole ellipse to that artifact. Containment is enforced to within 1px so the ellipse tracks the water
    rather than sitting inside it -- the behaviour clamp holds the *body box* inside this ellipse, and the
    drawn sprite is deliberately wider than its body box so fins may overlap the glass.
    """
    lo = rows[0][0] + int(round(len(rows) * 0.12))
    hi = rows[-1][0] - int(round(len(rows) * 0.08))
    band = [r for r in rows if lo <= r[0] <= hi]
    raw = [(x1 - x0 + 1) / 2 for _, x0, x1 in band]
    hw = [sorted(raw[max(0, i - 2):i + 3])[len(raw[max(0, i - 2):i + 3]) // 2] for i in range(len(raw))]
    body = [(band[i][0], hw[i]) for i in range(len(band))]
    widest = max(range(len(body)), key=lambda i: body[i][1])
    cx = (band[widest][1] + band[widest][2] + 1) / 2
    hw_max = body[widest][1]

    best: tuple[float, dict[str, float]] | None = None
    for cy in range(rows[0][0], rows[-1][0] + 1):
        for ry in range(20, 220):
            num = den = 0.0
            ok = True
            for y, half in body:
                t = 1 - ((y + 0.5 - cy) / ry) ** 2
                if t <= 0:
                    ok = False
                    break
                shape = math.sqrt(t)
                num += half * shape
                den += shape * shape
            if not ok or den == 0:
                continue
            rx = num / den
            if rx > hw_max + 2:
                continue
            err = sum((half - rx * math.sqrt(max(0.0, 1 - ((y + 0.5 - cy) / ry) ** 2))) ** 2
                      for y, half in body) / len(body)
            if best is None or err < best[0]:
                best = (err, {'cx': cx, 'cy': float(cy), 'rx': rx, 'ry': float(ry), 'rms': math.sqrt(err)})
    if best is None:
        raise SystemExit('could not fit the water ellipse')
    fit = best[1]
    shrink = 1.0
    for y, half in body:
        t = 1 - ((y + 0.5 - fit['cy']) / fit['ry']) ** 2
        if t <= 0:
            continue
        have = fit['rx'] * math.sqrt(t)
        if have > half + 1:
            shrink = min(shrink, (half + 1) / have)
    fit['rx'] *= shrink
    fit['shrink'] = shrink
    return fit


def feeder_inner_box(im: Image.Image, surface_y: int) -> dict[str, int] | None:
    """The feeder's inner window: the non-housing region enclosed by the dark housing above the water.

    Found structurally (flood the non-housing pixels in from the region border; what is left unreached is
    enclosed) rather than by flake colour, because the gravel is the same orange and the falling flakes
    below the feeder would stretch the box down into the water.
    """
    w, h = im.size
    px = im.load()
    x0, x1 = w // 2, w - 1
    y0, y1 = 0, max(0, surface_y - 1)

    def housing(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        return a > 128 and luma((r, g, b)) < 95

    seen: set[tuple[int, int]] = set()
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        if (x, y) not in seen and not housing(x, y):
            seen.add((x, y))
            q.append((x, y))

    for x in range(x0, x1 + 1):
        push(x, y0)
        push(x, y1)
    for y in range(y0, y1 + 1):
        push(x0, y)
        push(x1, y)
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if x0 <= nx <= x1 and y0 <= ny <= y1:
                push(nx, ny)
    inner = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)
             if px[x, y][3] > 128 and not housing(x, y) and (x, y) not in seen]
    if not inner:
        return None
    xs = [p[0] for p in inner]
    ys = [p[1] for p in inner]
    return {'x': min(xs), 'y': min(ys), 'w': max(xs) - min(xs) + 1, 'h': max(ys) - min(ys) + 1}


def report(im: Image.Image, grid: tuple[int, int]) -> dict[str, object]:
    rows = water_rows(im)
    surface_y, floor_y = rows[0][0], rows[-1][0]
    xs0 = min(r[1] for r in rows)
    xs1 = max(r[2] for r in rows)
    fit = fit_ellipse(rows)
    box = alpha_bbox(im)
    feeder = feeder_inner_box(im, surface_y)

    print()
    print('=== measurement report ===')
    print(f'size                {im.width}x{im.height} (grid {grid[0]}x{grid[1]})')
    print(f'opaqueRect          x{box["x"]} y{box["y"]} w{box["w"]} h{box["h"]}   (alpha bbox)')
    print(f'water rect          x{xs0} y{surface_y} w{xs1 - xs0 + 1} h{floor_y - surface_y + 1}')
    print(f'water band          surfaceY {surface_y} .. floorY {floor_y} ({len(rows)} rows)')
    print(f'ellipse fit         cx {fit["cx"]:.1f} cy {fit["cy"]:.0f} rx {fit["rx"]:.1f} ry {fit["ry"]:.0f}'
          f'   (rms {fit["rms"]:.2f} px, contained after x{fit["shrink"]:.3f})')
    if feeder:
        print(f'feeder inner box    x{feeder["x"]} y{feeder["y"]} w{feeder["w"]} h{feeder["h"]}'
              '   (-> pantryRect)')
    else:
        print('feeder inner box    NOT FOUND')
    print()
    print('water rows (y: x_min..x_max, width):')
    step = max(1, len(rows) // 24)
    for i, (y, a, b) in enumerate(rows):
        if i % step == 0 or i in (0, len(rows) - 1):
            print(f'  y{y:>4}: {a:>4}..{b:<4} w{b - a + 1}')
    print('=== end report ===')
    print()

    return {
        'size': [im.width, im.height],
        'opaqueRect': box,
        'water': {'x': xs0, 'y': surface_y, 'w': xs1 - xs0 + 1, 'h': floor_y - surface_y + 1},
        'waterShape': {'cx': fit['cx'], 'cy': fit['cy'], 'rx': fit['rx'], 'ry': fit['ry'],
                       'surfaceY': surface_y, 'floorY': floor_y},
        'ellipseFit': {'rms': fit['rms'], 'shrink': fit['shrink']},
        'feederInnerBox': feeder,
        'waterRows': [{'y': y, 'x0': a, 'x1': b} for y, a, b in rows],
    }


# --------------------------------------------------------------------------------- main

def build(grid: tuple[int, int], *, dither: str, threshold: int, outline_mode: str) -> Image.Image:
    src = Image.open(REFERENCE).convert('RGBA')
    print(f'source {os.path.relpath(REFERENCE, ROOT)} {src.width}x{src.height}')
    cropped, why = aspect_crop(src, grid)
    print(f'  aspect: {why}')
    small = downscale(cropped, grid)
    print(f'  resize: LANCZOS on premultiplied RGBA, {cropped.width}x{cropped.height} -> {grid[0]}x{grid[1]} '
          f'({cropped.width / grid[0]:.2f}x reduction)')
    small = harden_alpha(small, threshold)
    palette = shipped_palette()
    print(f'  palette: {len(palette)} opaque colours from {os.path.relpath(PALETTE_SRC, ROOT)}, dither={dither}')
    small = quantize(small, palette, dither)
    small = outline(small, palette, outline_mode)
    return small


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--dither', choices=('none', 'fs'), default='none')
    p.add_argument('--outline', choices=('darken', 'darkest', 'none'), default='darken')
    p.add_argument('--alpha-threshold', type=int, default=128, metavar='N')
    p.add_argument('--out', default=OUT, help='output path (default: assets/habitats/fish/bowl/bg.png)')
    p.add_argument('--json', metavar='PATH', help='also write the measurement report as JSON')
    p.add_argument('--report-only', action='store_true', help='measure the existing bg; write nothing')
    return p.parse_args(list(argv))


def main(argv: Iterable[str] = ()) -> None:
    args = parse_args(argv)
    grid = habitat_grid()
    if args.report_only:
        im = Image.open(args.out).convert('RGBA')
        print(f'reporting on the existing {os.path.relpath(args.out, ROOT)}')
    else:
        im = build(grid, dither=args.dither, threshold=args.alpha_threshold, outline_mode=args.outline)
        if im.size != grid:
            raise SystemExit(f'generated {im.size}, expected {grid}')
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        im.save(args.out)
        print('wrote', os.path.relpath(args.out, ROOT), im.size)
    data = report(im, grid)
    if args.json:
        with open(args.json, 'w', encoding='utf8') as fh:
            json.dump(data, fh, indent=2)
        print('wrote', args.json)


if __name__ == '__main__':
    import sys
    main(sys.argv[1:])
