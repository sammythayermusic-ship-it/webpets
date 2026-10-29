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
