"""The goldfish's shape, in one place: read by gf_build.py (Blender: the meshes) and gf_maps.py
(numpy: the texture maps), so the maps land on the geometry they were computed for.

Frame: the fish ROOT, Blender axes, metres. +x is the nose, +z is up (dorsal), y is lateral. The
glTF export turns this into the live layer's root space (+x nose, +y up, +z the fish's left), which is
the frame the spine shader in src/render/live/shaders.ts bends in. Its constants hold for this fish:
the head is rigid ahead of x = 0.045, the tail hinge is at x = -0.026, the tail tip at x = -0.0605.

Proportions are a common goldfish's, with a tail a little longer than a common's (a comet's leaning):
standard length (snout to the base of the tail) 0.087 m; body depth 0.37 of it, deepest about 40% of
the way back from the snout; the caudal peduncle a third of the body's depth; head length 0.27 of the
standard length; the eye a third of the head's depth, set high and forward.
"""
import math

import numpy as np

X_NOSE = 0.0600          # snout tip (the mouth sits on it)
X_CAUDAL = -0.0270       # base of the tail: the loft ends here, the caudal fin takes over
X_TAIL_TIP = -0.0605     # tips of the tail lobes
TAIL_HINGE = (-0.026, 0.0, 0.0)
SL = X_NOSE - X_CAUDAL   # standard length

# Profile control points along t = (x - X_CAUDAL) / SL: 0 at the tail base, 1 at the snout.
#            t      top     bottom  half-width
_PROFILE = [
    (0.000, 0.0050, 0.0049, 0.0017),
    (0.080, 0.0057, 0.0055, 0.0021),
    (0.200, 0.0094, 0.0086, 0.0034),
    (0.350, 0.0145, 0.0127, 0.0058),
    (0.500, 0.0174, 0.0146, 0.0075),
    (0.615, 0.0182, 0.0149, 0.0082),
    (0.740, 0.0170, 0.0140, 0.0081),
    (0.840, 0.0145, 0.0118, 0.0074),
    (0.920, 0.0108, 0.0087, 0.0062),
    (0.970, 0.0072, 0.0058, 0.0045),
    (1.000, 0.0031, 0.0027, 0.0022),
]


def _pchip(xs, ys, x):
    """Monotone cubic interpolation (Fritsch-Carlson): no overshoot between control points, so a
    profile never dents or bulges where nobody asked it to."""
    xs = np.asarray(xs, dtype=np.float64)
    ys = np.asarray(ys, dtype=np.float64)
    x = np.asarray(x, dtype=np.float64)
    h = np.diff(xs)
    d = np.diff(ys) / h
    m = np.zeros_like(ys)
    for i in range(1, len(xs) - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1 = 2 * h[i] + h[i - 1]
            w2 = h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    m[0] = d[0]
    m[-1] = d[-1]
    xc = np.clip(x, xs[0], xs[-1])
    k = np.clip(np.searchsorted(xs, xc) - 1, 0, len(xs) - 2)
    t = (xc - xs[k]) / h[k]
    t2 = t * t
    t3 = t2 * t
    return (
        (2 * t3 - 3 * t2 + 1) * ys[k]
        + (t3 - 2 * t2 + t) * h[k] * m[k]
        + (-2 * t3 + 3 * t2) * ys[k + 1]
        + (t3 - t2) * h[k] * m[k + 1]
    )


def t_of(x):
    return (np.asarray(x, dtype=np.float64) - X_CAUDAL) / SL


def top(x):
    return _pchip([p[0] for p in _PROFILE], [p[1] for p in _PROFILE], t_of(x))


def bottom(x):
    return _pchip([p[0] for p in _PROFILE], [p[2] for p in _PROFILE], t_of(x))


def half_width(x):
    return _pchip([p[0] for p in _PROFILE], [p[3] for p in _PROFILE], t_of(x))


def centre_z(x):
    """The snout dips a hair below the midline: a terminal mouth, not a beak."""
    t = t_of(x)
    s = np.clip((t - 0.86) / 0.14, 0.0, 1.0)
    return -0.0009 * s * s * (3 - 2 * s)


def section(x, theta):
    """Body surface point at length x and section angle theta (0 dorsal, pi ventral, pi/2 the side
    at -y, which is the fish's LEFT and faces the bowl camera at rest). Returns (y, z).

    A superellipse a little fuller than an ellipse on the belly, and narrower toward the dorsal
    ridge: a goldfish is round-bellied and keeled along the back."""
    x = np.asarray(x, dtype=np.float64)
    theta = np.asarray(theta, dtype=np.float64)
    c = np.cos(theta)
    s = np.sin(theta)
    up = c >= 0
    h = np.where(up, top(x), bottom(x))
    n = np.where(up, 2.0, 2.35)
    zc = centre_z(x)
    z = zc + h * np.sign(c) * np.abs(c) ** (2.0 / n)
    keel = 1.0 - 0.28 * np.clip(c, 0.0, 1.0) ** 5
    y = -half_width(x) * keel * np.sign(s) * np.abs(s) ** (2.0 / n)
    return y, z


# ---------------------------------------------------------------------------------------- UVs
# u runs along the body, tail base 0 -> snout 1. v runs around it starting at the belly midline:
# v = 0 belly, 0.25 the left side (-y), 0.5 the dorsal midline, 0.75 the right side, 1 belly again.
# The seam is on the belly, the one line the camera never looks along.

def u_of_x(x):
    return (np.asarray(x) - X_CAUDAL) / SL


def x_of_u(u):
    return X_CAUDAL + np.asarray(u) * SL


def theta_of_v(v):
    return math.pi + 2.0 * math.pi * np.asarray(v)


# ---------------------------------------------------------------------------------------- head
EYE_X = 0.0478
EYE_Z = 0.0036
EYE_R = 0.0042
NOSTRIL_X = 0.0545
NOSTRIL_Z = 0.0047


def operculum_x(zn):
    """Back edge of the gill cover at normalised height zn (-1 belly .. 1 back): a curve that bows
    toward the tail at mid-height, like the cover's free edge."""
    zn = np.asarray(zn, dtype=np.float64)
    return 0.0362 - 0.0042 * (1.0 - zn * zn) + 0.0006 * zn


def eye_centre(side):
    """Centre of the eyeball, side = -1 (left, -y) or +1 (right). Set into the head so a little
    over half of it shows: a goldfish eye bulges, it is not a bead on the surface."""
    w = float(half_width(EYE_X))
    return (EYE_X, side * (w * 0.62), EYE_Z)


# ---------------------------------------------------------------------------------------- fins
# Every fin is a fan of rays between a ROOT curve on the body and an EDGE curve, both functions of
# u in [0, 1] (leading ray to trailing ray). The mesh is a grid in (u, v) with v from root (0) to
# edge (1); the shared fin map draws rays along constant u, four to a tile, so a fin's u texture
# range is rays / 4. `cup` bows the membrane off its plane so a fin is never a flat card.

def _lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def _catmull(points, u):
    """Uniform Catmull-Rom through `points` (a list of 3-tuples) at u in [0, 1]."""
    n = len(points) - 1
    f = min(max(u, 0.0), 1.0) * n
    i = min(int(f), n - 1)
    t = f - i
    p0 = points[max(i - 1, 0)]
    p1 = points[i]
    p2 = points[i + 1]
    p3 = points[min(i + 2, n)]
    t2 = t * t
    t3 = t2 * t
    return tuple(
        0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
        for k in range(3)
    )


def _dorsal_root(u):
    x = 0.0235 + (-0.0125 - 0.0235) * u
    return (x, 0.0, float(top(x) + centre_z(x)) - 0.0007)


def _dorsal_edge(u):
    r = _dorsal_root(u)
    # a goldfish's long-based dorsal: tallest at the front, the top margin sloping almost straight
    # down to a short last ray near the tail
    hgt = 0.0138 * (1.0 - 0.76 * u ** 0.7) + 0.0004 * math.sin(math.pi * u)
    ang = math.radians(26 + 30 * u)
    return (r[0] - hgt * math.sin(ang), 0.0, r[2] + hgt * math.cos(ang))


def _caudal_root(u):
    zt, zb = 0.0047, -0.0046
    return (-0.0240 - 0.0012 * math.sin(math.pi * u), 0.0, zt + (zb - zt) * u)


_CAUDAL_EDGE = [
    (-0.0605, 0.0, 0.0218),
    (-0.0568, 0.0, 0.0146),
    (-0.0516, 0.0, 0.0075),
    (-0.0462, 0.0, 0.0010),
    (-0.0512, 0.0, -0.0058),
    (-0.0560, 0.0, -0.0127),
    (-0.0598, 0.0, -0.0198),
]


def _caudal_edge(u):
    return _catmull(_CAUDAL_EDGE, u)


def _anal_root(u):
    x = -0.0050 + (-0.0168 + 0.0050) * u
    return (x, 0.0, float(centre_z(x) - bottom(x)) + 0.0006)


def _anal_edge(u):
    r = _anal_root(u)
    hgt = 0.0098 * (1.0 - 0.68 * u) + 0.0008 * math.sin(math.pi * u)
    ang = math.radians(38 + 26 * u)
    return (r[0] - hgt * math.sin(ang), 0.0, r[2] - hgt * math.cos(ang))


def _norm(d):
    n = math.sqrt(sum(c * c for c in d))
    return tuple(c / n for c in d)


def _fan(d0, d1, u):
    """Ray direction swung from d0 (leading ray) to d1 (trailing ray): paired fins are fans."""
    return _norm(tuple(d0[i] + (d1[i] - d0[i]) * u for i in range(3)))


def _pelvic(side):
    def root(u):
        x = 0.0128 + (0.0072 - 0.0128) * u
        zb = float(centre_z(x) - bottom(x))
        return (x, side * 0.0024, zb * 0.93)

    def edge(u):
        r = root(u)
        hgt = 0.0122 * (1.0 - 0.45 * u) + 0.0010 * math.sin(math.pi * u)
        d = _fan((-0.40, side * 0.28, -0.88), (-0.88, side * 0.28, -0.40), u)
        return (r[0] + hgt * d[0], r[1] + hgt * d[1], r[2] + hgt * d[2])

    return root, edge


def _pectoral(side):
    def root(u):
        x = 0.0338 + (0.0310 - 0.0338) * u
        z = -0.0040 + (-0.0080 + 0.0040) * u
        return (x, side * float(half_width(x)) * 0.82, z)

    def edge(u):
        r = root(u)
        hgt = 0.0132 * (0.72 + 0.28 * math.sin(math.pi * (0.2 + 0.8 * u)))
        d = _fan((-0.90, side * 0.38, -0.05), (-0.42, side * 0.38, -0.86), u)
        return (r[0] + hgt * d[0], r[1] + hgt * d[1], r[2] + hgt * d[2])

    return root, edge


def fins():
    """name -> dict(root, edge, rays, cup, nu, nv, flutter). `flutter` is the live layer's mode:
    1 dorsal/anal (trailing edge), 2 paired fins (scull), 3 tail."""
    out = {
        "HERO_fish_fin_dorsal": dict(root=_dorsal_root, edge=_dorsal_edge, rays=16, cup=0.0006, flutter=1),
        "HERO_fish_tail": dict(root=_caudal_root, edge=_caudal_edge, rays=20, cup=0.0010, flutter=3),
        "HERO_fish_fin_anal": dict(root=_anal_root, edge=_anal_edge, rays=8, cup=0.0004, flutter=1),
    }
    for side, tag in ((-1, "l"), (1, "r")):
        r, e = _pelvic(side)
        out["HERO_fish_fin_pel_" + tag] = dict(root=r, edge=e, rays=8, cup=0.0006 * side, flutter=2)
        r, e = _pectoral(side)
        out["HERO_fish_fin_pec_" + tag] = dict(root=r, edge=e, rays=11, cup=0.0008 * side, flutter=2)
    return out


def fin_point(fin, u, v):
    """A point on a fin's membrane: between root and edge, bowed by `cup` off the root-edge plane."""
    r = fin["root"](u)
    e = fin["edge"](u)
    p = _lerp(r, e, v)
    bow = fin["cup"] * math.sin(math.pi * u) * v
    # Bow along the fin's own normal: for the median fins (in the y = 0 plane) that is y; for the
    # paired fins, the lateral axis is close enough at this size.
    return (p[0], p[1] + bow, p[2])
