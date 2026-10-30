"""The goldfish's texture maps, computed from its shape (gf_shape.py). Plain Python 3 + numpy + Pillow.

    python3 assets/3d/scripts/gf_maps.py <out_dir> [--preview <png>]

Writes, under <out_dir>:
  body_color.jpg   base colour, sRGB          1024 x 1024, u along the body, v around it (gf_shape)
  body_normal.jpg  tangent-space normal        same UVs; +x toward the snout (increasing u), +y toward
                                               increasing glTF v (down the image): the frame three.js
                                               builds from screen-space derivatives
  body_orm.png     R ambient occlusion, G roughness, B metalness (linear)
  fin_color.png    RGBA, rays along constant u, four rays to a tile, repeats in u; v root -> edge
  fin_normal.png   the rays' relief
  eye.png          RGBA iris: black pupil, gold ring, dark limbus, fading to skin at the rim

This is what candidate A did with Cycles nodes (a_look.py: scale relief with darker edges, fin rays
driving bump and translucency, a gold-ringed eye), moved into maps a real-time material can sample.
Every texel of the body map knows its point on the fish, because the UVs ARE the loft's parameters,
so the pattern is computed on the surface (scale rows that follow the body and shrink toward the
tail, a gill cover, a lateral line, eye socket, nostrils) rather than painted onto a flat sheet.
"""
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gf_shape as G  # noqa: E402

N = 1024          # body map size
FN = 512          # fin map size
EN = 256          # eye map size
SEED = 1977


def srgb_u8(rgb_linear01):
    """Linear 0..1 -> sRGB 8-bit."""
    c = np.clip(rgb_linear01, 0.0, 1.0)
    s = np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)
    return np.clip(s * 255.0 + 0.5, 0, 255).astype(np.uint8)


def lin(r, g, b):
    """sRGB 8-bit triple -> linear float array."""
    c = np.array([r, g, b], dtype=np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def hash2(a, b, salt=0):
    """Deterministic per-cell random in [0, 1) from two integer arrays."""
    a = a.astype(np.int64)
    b = b.astype(np.int64)
    h = (a * 374761393 + b * 668265263 + salt * 2246822519 + SEED) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF).astype(np.float64) / float(0x1000000)


def value_noise(x, y, salt=0):
    xi = np.floor(x)
    yi = np.floor(y)
    xf = x - xi
    yf = y - yi
    xf = xf * xf * (3 - 2 * xf)
    yf = yf * yf * (3 - 2 * yf)
    a = hash2(xi, yi, salt)
    b = hash2(xi + 1, yi, salt)
    c = hash2(xi, yi + 1, salt)
    d = hash2(xi + 1, yi + 1, salt)
    return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf


def fbm(x, y, octaves=4, salt=0):
    v = np.zeros_like(x)
    amp = 0.5
    f = 1.0
    for i in range(octaves):
        v += amp * value_noise(x * f, y * f, salt + i * 17)
        amp *= 0.5
        f *= 2.03
    return v


def normal_from_height(h, mx, my, strength=1.0):
    """Tangent-space normal from a height field (metres) with mx, my metres per texel along +col and
    +row. Returns uint8 RGB."""
    gx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (2.0 * mx)
    gy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) / (2.0 * my)
    gx[:, 0] = gx[:, 1]
    gx[:, -1] = gx[:, -2]
    nx = -gx * strength
    ny = -gy * strength
    nz = np.ones_like(h)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.dstack([nx * inv, ny * inv, nz * inv])
    return np.clip((n * 0.5 + 0.5) * 255.0 + 0.5, 0, 255).astype(np.uint8)


def blur(a, passes=1):
    for _ in range(passes):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5.0
    return a


# ======================================================================================== body
def body_maps(out):
    cols = (np.arange(N) + 0.5) / N
    rows = (np.arange(N) + 0.5) / N
    U, VG = np.meshgrid(cols, rows)              # VG: glTF v (down the image)
    VB = 1.0 - VG                                # Blender v (gf_shape's v)
    X = G.x_of_u(U)
    TH = G.theta_of_v(VB)
    Y, Z = G.section(X, TH)

    # metres per texel, along +col (u) and +row (glTF v), from the surface itself
    P = np.dstack([X, Y, Z])
    dcol = np.linalg.norm(np.roll(P, -1, axis=1) - P, axis=2)
    dcol[:, -1] = dcol[:, -2]
    drow = np.linalg.norm(np.roll(P, -1, axis=0) - P, axis=2)
    drow[-1, :] = drow[-2, :]

    # normalised height on the body: -1 belly .. +1 back, and the arc from the dorsal midline
    top = G.top(X)
    bot = G.bottom(X)
    zc = G.centre_z(X)
    ZN = np.where(Z >= zc, (Z - zc) / np.maximum(top, 1e-6), (Z - zc) / np.maximum(bot, 1e-6))
    # arc length from the dorsal midline, per column, both ways round; rows are uniform in theta
    dorsal_row = int(round(0.5 * N))            # v = 0.5 is the dorsal midline (glTF v 0.5 too)
    seg = drow                                   # distance row -> row+1
    arc = np.zeros_like(X)
    for r in range(dorsal_row + 1, N):
        arc[r] = arc[r - 1] + seg[r - 1]
    for r in range(dorsal_row - 1, -1, -1):
        arc[r] = arc[r + 1] + seg[r]
    half_circ = np.maximum(arc[0:1, :], arc[N - 1:N, :])
    YN = np.clip(arc / np.maximum(half_circ, 1e-6), 0.0, 1.0)   # 0 dorsal .. 1 belly
    side = np.where(VB < 0.5, -1.0, 1.0)                          # -1: the left (-y) side

    # ---- scale grid -------------------------------------------------------------------------
    # Along the body: ~27 scales on the lateral line from the gill cover to the tail, smaller
    # toward the tail and the head (pitch follows the local depth). Around: 15 rows a side.
    xs = G.x_of_u(cols)
    depth = G.top(xs) + G.bottom(xs)
    pitch = 0.00235 * (0.52 + 0.48 * depth / depth.max())
    dx = np.diff(xs, prepend=xs[0])
    S = np.cumsum(dx / pitch)                   # scale index along x, increases toward the snout
    A = np.broadcast_to(S[None, :], X.shape)
    ROWS = 15.0
    B = YN * ROWS

    best = np.full(X.shape, -1e9)
    second = np.full(X.shape, -1e9)
    win_d = np.ones(X.shape)
    win_id_a = np.zeros(X.shape)
    win_id_b = np.zeros(X.shape)
    win_da = np.zeros(X.shape)
    win_db = np.zeros(X.shape)
    RA, RB = 0.78, 0.66
    r0 = np.floor(B)
    for drr in (-1, 0, 1):
        r = r0 + drr
        shift = 0.5 * np.mod(r, 2.0)
        k0 = np.round(A - shift)
        for dk in (-1, 0, 1):
            k = k0 + dk
            ca = k + shift
            cb = r + 0.5
            da = A - ca
            db = B - cb
            d = np.sqrt((da / RA) ** 2 + (db / RB) ** 2)
            inside = d < 1.0
            # rises toward the scale's free (tail-ward, -a) edge; domed across
            h = 0.55 - 0.45 * da - 0.55 * db * db
            h = np.where(inside, h, -1e9)
            better = h > best
            second = np.where(better, best, np.maximum(second, h))
            best = np.where(better, h, best)
            win_d = np.where(better, d, win_d)
            win_id_a = np.where(better, k, win_id_a)
            win_id_b = np.where(better, r * side, win_id_b)
            win_da = np.where(better, da, win_da)
            win_db = np.where(better, db, win_db)
    gap = np.clip(best - second, 0.0, 1.0)
    bevel = smooth(1.0, 0.86, win_d)
    scale_h = (best + 0.2) * (0.35 + 0.65 * bevel)
    seam = 1.0 - smooth(0.0, 0.07, gap)          # 1 on a boundary between scales: the net
    rnd = hash2(win_id_a, win_id_b)
    rnd2 = hash2(win_id_a, win_id_b, 7)

    # ---- where the scales are: behind the gill cover, ahead of the tail base ----------------------
    opx = G.operculum_x(ZN)
    scaled = smooth(opx + 0.0003, opx - 0.0012, X)          # 1 behind the cover's edge
    head = 1.0 - scaled
    # the cover's free edge: a flap standing a hair proud of the body, a bright lip, a dark gap
    edge_d = (X - opx) / 0.0006
    flap = smooth(-0.2, 1.4, edge_d) * smooth(6.0, 1.2, edge_d)
    gill_line = np.exp(-((edge_d + 0.7) ** 2) / 0.5)
    # the pre-opercle: a fainter groove a few mm ahead of the cover's edge
    preop = np.exp(-(((X - (opx + 0.0052)) / 0.0004) ** 2)) * smooth(0.95, 0.1, np.abs(ZN))

    # ---- eye socket, nostrils (both sides, lateral surfaces only) -----------------------------------
    lateral = smooth(0.15, 0.55, np.abs(np.sin(TH)))
    er = np.hypot(X - G.EYE_X, Z - G.EYE_Z) / G.EYE_R
    socket = np.exp(-((er - 1.08) / 0.16) ** 2) * lateral
    under_eye = (er < 1.0) * lateral
    nr = np.hypot(X - G.NOSTRIL_X, Z - G.NOSTRIL_Z) / 0.0007
    nostril = np.exp(-(nr ** 2)) * lateral
    # the mouth's corner: a short crease back from the lips
    mouth_crease = np.exp(-(((Z - (G.centre_z(X) - 0.0006)) / 0.00025) ** 2)) * smooth(0.0570, 0.0595, X) * lateral

    # ---- lateral line: one pore per scale on the row ~40% down from the back --------------------------
    ll_row_b = 0.40 * ROWS
    on_ll = np.abs(np.floor(B) + 0.5 - (np.floor(ll_row_b) + 0.5)) < 0.01
    pore = np.exp(-((win_da / 0.16) ** 2 + (win_db / 0.12) ** 2)) * on_ll * scaled

    # ---- height (metres) --------------------------------------------------------------------------
    A_SCALE = 0.00010
    fine = fbm(X * 9000.0, Z * 9000.0, 3, salt=3)
    h = scale_h * A_SCALE * scaled
    h += head * (fine - 0.5) * 0.000012
    h += flap * 0.00009 * head + (-gill_line * 0.00006)
    h -= preop * 0.00004
    h -= socket * 0.00006
    h -= nostril * 0.00010
    h -= pore * 0.00006
    h -= mouth_crease * 0.00005
    h = blur(h, 1)

    # ---- colour (linear) -------------------------------------------------------------------------
    stops = [
        (0.00, lin(186, 48, 10)),
        (0.18, lin(218, 72, 14)),
        (0.36, lin(236, 100, 18)),
        (0.55, lin(243, 124, 26)),
        (0.74, lin(246, 148, 42)),
        (0.88, lin(245, 180, 92)),
        (1.00, lin(238, 200, 140)),
    ]
    col = np.zeros(X.shape + (3,))
    for i in range(len(stops) - 1):
        t0, c0 = stops[i]
        t1, c1 = stops[i + 1]
        w = np.clip((YN - t0) / (t1 - t0), 0.0, 1.0)
        m = (YN >= t0) & (YN <= t1 + 1e-9)
        col = np.where(m[..., None], c0 * (1 - w[..., None]) + c1 * w[..., None], col)
    # head: a little redder on top, golden cheeks on the cover, a pinker snout
    cheek = head * smooth(-0.6, 0.0, ZN) * smooth(0.95, 0.2, ZN)
    col = col * (1 - 0.10 * cheek[..., None]) + lin(248, 160, 56) * (0.10 * cheek[..., None])
    col *= (1.0 - 0.17 * head)[..., None]
    snout = smooth(0.052, 0.060, X)
    col = col * (1 - 0.25 * snout[..., None]) + lin(240, 120, 70) * (0.25 * snout[..., None])
    # slow blotches, so it is not CG-uniform
    blot = fbm(X * 260.0, Z * 260.0 + side * 3.0, 4, salt=11) - 0.5
    col *= (1.0 + 0.10 * blot)[..., None]
    # per scale: a little value and warmth each, and the reticulated darker margins
    sv = (0.93 + 0.13 * rnd) * scaled + head
    col *= sv[..., None]
    warm = rnd2 * scaled
    col *= 1.0 - warm[..., None] * np.array([0.0, 0.07, 0.14])
    net = seam * scaled
    col = col * (1 - 0.42 * net[..., None]) + lin(150, 36, 8) * (0.42 * net[..., None])
    # each scale's exposed middle is a touch brighter (the guanine shine under the pigment)
    shine = scaled * smooth(0.95, 0.25, win_d) * smooth(-0.6, 0.3, -win_da)
    col *= (1.0 + 0.07 * shine)[..., None]
    # gill cover: a pale lip and the red of the gills in the gap behind it
    col = col * (1 - 0.35 * gill_line[..., None]) + lin(200, 40, 30) * (0.35 * gill_line[..., None])
    col *= (1.0 + 0.10 * (flap * head))[..., None]
    col *= (1.0 - 0.18 * preop)[..., None]
    col *= (1.0 - 0.12 * socket)[..., None]
    col *= (1.0 - 0.5 * nostril)[..., None]
    col *= (1.0 - 0.45 * pore)[..., None]
    col *= (1.0 - 0.4 * mouth_crease)[..., None]
    col = col * (1 - under_eye[..., None] * 0.3) + lin(40, 20, 12) * under_eye[..., None] * 0.3

    # ---- roughness / metalness / AO ----------------------------------------------------------------
    rough = 0.34 + 0.12 * seam * scaled + 0.10 * head + 0.15 * socket
    metal = (0.18 + 0.30 * rnd ** 3) * scaled + 0.10 * head * (1 - snout) + 0.10 * (YN > 0.8)
    ao = 1.0 - 0.35 * seam * scaled * smooth(0.0, 0.4, -win_da) - 0.3 * gill_line - 0.3 * socket
    ao = np.clip(ao, 0.0, 1.0)

    mx = np.maximum(dcol, 1e-7)
    my = np.maximum(drow, 1e-7)
    nrm = normal_from_height(h, mx, my, strength=1.0)

    os.makedirs(out, exist_ok=True)
    Image.fromarray(srgb_u8(col)).save(os.path.join(out, "body_color.jpg"), quality=90, subsampling=0)
    Image.fromarray(nrm).save(os.path.join(out, "body_normal.jpg"), quality=92, subsampling=0)
    orm = np.dstack([ao, np.clip(rough, 0, 1), np.clip(metal, 0, 1)])
    Image.fromarray(np.clip(orm * 255 + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(out, "body_orm.png"), optimize=True)
    return col, nrm


# ======================================================================================== fins
def fin_maps(out):
    """One tile = four rays across u (repeats), v from root (0) to edge (1). Rays thicken toward the
    root, fork twice toward the edge, carry joints; the membrane between them is thin and lets light
    through; the edge is frayed and pale."""
    c = (np.arange(FN) + 0.5) / FN
    U, V = np.meshgrid(c, c)
    ray_u = U * 4.0
    rays = np.zeros(U.shape)
    ridge_h = np.zeros(U.shape)
    for i in range(-1, 5):
        cu = i + 0.5
        # one fork, two thirds of the way out: a ray becomes two
        f1 = smooth(0.55, 0.85, V) * 0.17
        width = (0.085 * (1 - V) + 0.030) * (1.0 - 0.30 * smooth(0.55, 0.85, V))
        for s1 in (-1, 1):
            cuv = cu + s1 * f1
            d = np.abs(ray_u - cuv) / np.maximum(width, 1e-4)
            prof = np.clip(1.0 - d * d, 0.0, 1.0)
            rays = np.maximum(rays, prof)
            ridge_h = np.maximum(ridge_h, prof)
    # joints: thin darker crossings along the rays, closer together toward the edge
    seg = np.sin((V ** 0.8) * 46.0) ** 24
    joints = seg * rays * smooth(0.18, 0.3, V)
    fray = fbm(U * 40.0, V * 6.0, 3, salt=5)
    edge_fade = smooth(0.995, 0.90 - 0.06 * fray, V)
    tip_pale = smooth(0.70, 1.0, V)
    root = smooth(0.10, 0.0, V)

    ray_col = lin(240, 112, 30)
    mem_col = lin(250, 128, 34)
    tip_col = lin(255, 214, 170)
    col = mem_col * (1 - rays[..., None]) + ray_col * rays[..., None]
    col = col * (1 - 0.4 * tip_pale[..., None]) + tip_col * (0.4 * tip_pale[..., None])
    col *= (1.0 - 0.15 * joints)[..., None]
    col = col * (1 - root[..., None]) + lin(236, 120, 36) * root[..., None]
    streak = fbm(U * 3.0, V * 30.0, 3, salt=9) - 0.5
    col *= (1.0 + 0.12 * streak)[..., None]
    alpha = 0.70 * (1 - 0.45 * V) + 0.18 * rays * (1 - 0.3 * V)
    alpha = np.maximum(alpha, root)
    alpha *= edge_fade
    alpha = np.clip(alpha, 0.0, 1.0)

    rgba = np.dstack([srgb_u8(col), np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)])
    Image.fromarray(rgba).save(os.path.join(out, "fin_color.png"), optimize=True)
    # rays stand ~0.04 mm proud; a tile is ~4 rays over ~4 mm of fin, 512 px across
    h = ridge_h * 0.00004 - joints * 0.00001
    nrm = normal_from_height(h, 0.004 / FN, 0.012 / FN, strength=1.0)
    Image.fromarray(nrm).save(os.path.join(out, "fin_normal.png"), optimize=True)
    return rgba


# ======================================================================================== eye
def eye_map(out):
    c = (np.arange(EN) + 0.5) / EN * 2.0 - 1.0
    X, Y = np.meshgrid(c, c)
    r = np.hypot(X, Y)
    a = np.arctan2(Y, X)
    fib = fbm(a * 12.0, r * 6.0, 3, salt=21)
    spots = (fbm(X * 9.0, Y * 9.0, 2, salt=23) > 0.68) * smooth(0.55, 0.62, r) * smooth(0.86, 0.78, r)
    pupil = smooth(0.52, 0.47, r)
    iris_in = lin(246, 198, 82)
    iris_out = lin(196, 104, 30)
    t = smooth(0.50, 0.82, r)
    col = iris_in * (1 - t[..., None]) + iris_out * t[..., None]
    col *= (0.82 + 0.36 * fib)[..., None]
    col = col * (1 - 0.6 * spots[..., None]) + lin(60, 30, 14) * (0.6 * spots[..., None])
    limbus = smooth(0.82, 0.92, r)
    col = col * (1 - limbus[..., None]) + lin(40, 22, 14) * limbus[..., None]
    skin = smooth(0.90, 1.0, r)
    col = col * (1 - skin[..., None]) + lin(230, 110, 30) * skin[..., None]
    col = col * (1 - pupil[..., None]) + lin(6, 5, 6) * pupil[..., None]
    rgba = np.dstack([srgb_u8(col), np.full(r.shape, 255, np.uint8)])
    Image.fromarray(rgba).save(os.path.join(out, "eye.png"), optimize=True)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "assets/live/goldfish"
    body_maps(out)
    fin_maps(out)
    eye_map(out)
    for f in sorted(os.listdir(out)):
        print("WP_WROTE %s (%d bytes)" % (os.path.join(out, f), os.path.getsize(os.path.join(out, f))))


if __name__ == "__main__":
    main()
