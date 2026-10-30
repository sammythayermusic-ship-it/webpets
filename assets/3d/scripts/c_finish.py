"""Candidate C: turn c_plates.py's passes into the delivered plates.

    python3 c_finish.py <stage_dir> <dest_dir>

For each variant folder under <stage_dir> (day, night, memorial) this is finish2.build_bowl verbatim:
isolate the contact shadow and re-lay it with an elliptical falloff, divide the front-glass
reflections back out of the beauty pass, cut decor_front from the bg pixels by the near/far matte,
and pass the glass through. Day writes bg/decor_front/glass.png, night writes the same three with a
`_night` suffix, memorial writes memorial.png (day lighting; the app tints it at night like before).
"""
import json
import os
import sys
import numpy as np
from PIL import Image

STAGE = sys.argv[1]
DEST = sys.argv[2]
SHADOW_OPACITY = 0.52
SHADOW_TINT = np.array([0.055, 0.060, 0.080], dtype=np.float32)
NIGHT_SHADOW_TINT = np.array([0.02, 0.025, 0.06], dtype=np.float32)
# Long, warm-edged shadows: the step-3 dawn and dusk sets.
DAWN_SHADOW_TINT = np.array([0.07, 0.05, 0.08], dtype=np.float32)
DUSK_SHADOW_TINT = np.array([0.08, 0.045, 0.05], dtype=np.float32)
EPS = 1e-6


def load(path):
    a = np.asarray(Image.open(path).convert("RGBA"), dtype=np.float32) / 255.0
    return a[:, :, :3].copy(), a[:, :, 3].copy()


def save(rgb, alpha, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = np.clip(np.dstack([rgb, alpha]) * 255.0 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(path, optimize=True)
    return path


def un_composite(beauty_rgb, g_rgb, g_a):
    den = np.maximum(1.0 - g_a, 0.10)[:, :, None]
    divided = np.clip((beauty_rgb - g_rgb * g_a[:, :, None]) / den, 0.0, 1.0)
    t = np.clip((g_a - 0.45) / 0.40, 0.0, 1.0)
    t = (t * t * (3.0 - 2.0 * t))[:, :, None]
    return divided * (1.0 - t) + beauty_rgb * t


def over(s_rgb, s_a, d_rgb, d_a):
    a = s_a + d_a * (1.0 - s_a)
    den = np.maximum(a, EPS)[:, :, None]
    rgb = (s_rgb * s_a[:, :, None] + d_rgb * (d_a * (1.0 - s_a))[:, :, None]) / den
    return rgb, a


def box_blur(a, r, passes=3):
    """Separable box blur, `passes` times (three passes is close to a gaussian of sigma ~r)."""
    out = a.astype(np.float32)
    k = 2 * r + 1
    for _ in range(passes):
        for axis in (0, 1):
            pad = [(0, 0)] * out.ndim
            pad[axis] = (r + 1, r)
            c = np.cumsum(np.pad(out, pad, mode="edge"), axis=axis)
            hi = np.take(c, np.arange(k, k + out.shape[axis]), axis=axis)
            lo = np.take(c, np.arange(0, out.shape[axis]), axis=axis)
            out = (hi - lo) / k
    return out


def quiet_glass(rgb, a, contents):
    """Step B: with transparent glass the bg's see-through regions come out of Cycles grainy (the
    denoiser does not clean alpha through glass), and the live water lets that show. Glass
    reflections are soft by nature, so blur the glass-only regions -- premultiplied, so colour does
    not bleed from transparent pixels -- and keep everything that is a thing (gravel, plants, stand,
    the rim where the glass is near opaque) exactly as rendered."""
    keep = np.clip(box_blur(contents, 2, 1) * 4.0, 0.0, 1.0)
    # only well inside the glass: blurring at the silhouette would smear the rim out into a halo
    inside = (box_blur((a > 0.03).astype(np.float32), 6, 1) > 0.999).astype(np.float32)
    w = (1.0 - keep) * np.clip((0.9 - a) / 0.4, 0.0, 1.0) * box_blur(inside, 2, 1)
    pm = rgb * a[:, :, None]
    pm_b = box_blur(pm, 3)
    a_b = box_blur(a, 3)
    a2 = a * (1 - w) + a_b * w
    pm2 = pm * (1 - w[:, :, None]) + pm_b * w[:, :, None]
    rgb2 = pm2 / np.maximum(a2, EPS)[:, :, None]
    return np.clip(rgb2, 0.0, 1.0), np.clip(a2, 0.0, 1.0)


def quiet_front_glass(rgb, a):
    """The front-glass pass has the same Cycles grain in its thin reflections (alpha ~0.15 over the
    whole water), and it is drawn over everything. Smooth where it is faint, keep the bright
    highlights and the rim (alpha above ~0.5) as rendered."""
    inside = (box_blur((a > 0.03).astype(np.float32), 6, 1) > 0.999).astype(np.float32)
    w = np.clip((0.55 - a) / 0.3, 0.0, 1.0) * box_blur(inside, 2, 1)
    pm = rgb * a[:, :, None]
    pm_b = box_blur(pm, 2)
    a_b = box_blur(a, 2)
    a2 = a * (1 - w) + a_b * w
    pm2 = pm * (1 - w[:, :, None]) + pm_b * w[:, :, None]
    return np.clip(pm2 / np.maximum(a2, EPS)[:, :, None], 0.0, 1.0), np.clip(a2, 0.0, 1.0)


def bbox(a, thr):
    ys, xs = np.nonzero(a > thr)
    if len(xs) == 0:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]


def build(variant, suffix, night, tint=None):
    src = os.path.join(STAGE, variant)
    b_rgb, b_a = load(os.path.join(src, "_bg_shadow.png"))
    c_rgb, c_a = load(os.path.join(src, "_bg_clean.png"))
    m_rgb, _ = load(os.path.join(src, "_mask.png"))
    g_rgb, g_a = load(os.path.join(src, "_glass.png"))
    g_rgb, g_a = quiet_front_glass(g_rgb, g_a)
    h, w = c_a.shape
    raw = np.clip(b_a - c_a, 0.0, 1.0)
    x0, y0, x1, y1 = bbox(c_a, 0.02)
    bw = x1 - x0
    cx, cy = (x0 + x1) * 0.5, float(y1) - bw * 0.020
    rx, ry = bw * 0.60, bw * 0.135
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fall = np.clip(1.0 - (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2), 0.0, 1.0) ** 1.35
    s_a = raw * fall * SHADOW_OPACITY * (0.8 if night else 1.0)
    base_tint = tint if tint is not None else (NIGHT_SHADOW_TINT if night else SHADOW_TINT)
    s_rgb = np.broadcast_to(base_tint, (h, w, 3)).copy()
    c_rgb = un_composite(c_rgb, g_rgb, g_a)
    cpath = os.path.join(DEST, "contents.png")
    if os.path.exists(cpath):
        contents = np.asarray(Image.open(cpath).convert("L"), dtype=np.float32) / 255.0
        if contents.shape == c_a.shape:
            c_rgb, c_a = quiet_glass(c_rgb, c_a, contents)
    bg_rgb, bg_a = over(c_rgb, c_a, s_rgb, s_a)
    if variant == "memorial":
        save(bg_rgb, bg_a, os.path.join(DEST, "memorial%s.png" % suffix))
        return {"variant": variant, "opaqueRect": bbox(bg_a, 0.5)}
    save(bg_rgb, bg_a, os.path.join(DEST, "bg%s.png" % suffix))
    mask = np.clip(m_rgb[:, :, 0], 0.0, 1.0)
    save(bg_rgb, bg_a * mask, os.path.join(DEST, "decor_front%s.png" % suffix))
    save(g_rgb, g_a, os.path.join(DEST, "glass%s.png" % suffix))
    return {"variant": variant, "opaqueRect": bbox(bg_a, 0.5), "opaqueRect_thr002": bbox(bg_a, 0.02),
            "glass_median_alpha": round(float(np.median(g_a[g_a > 0.02])), 3),
            "decor_coverage_pct": round(float((bg_a * mask > 0.5).mean()) * 100, 2)}


res = []
VARIANTS = (
    ("day", "", False, None),
    ("night", "_night", True, None),
    ("dawn", "_dawn", False, DAWN_SHADOW_TINT),
    ("dusk", "_dusk", False, DUSK_SHADOW_TINT),
    ("memorial", "", False, None),
)
for variant, suffix, night, tint in VARIANTS:
    if os.path.isdir(os.path.join(STAGE, variant)):
        res.append(build(variant, suffix, night, tint))
print(json.dumps(res, indent=1))
