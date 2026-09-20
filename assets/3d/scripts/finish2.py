"""Finish the layered bowl and the eight fish states, and verify both.

Usage: finish2.py <stage_dir> <dest_dir> [--verify-only]
"""

import os
import sys
import glob
import json
import shutil
import numpy as np
from PIL import Image

STAGE = sys.argv[1]
DEST = sys.argv[2]

SHADOW_OPACITY = 0.52
SHADOW_TINT = np.array([0.055, 0.060, 0.080], dtype=np.float32)
ALPHA_THRESHOLD = 0.5          # stated in geometry.json
EPS = 1e-6

STATES = [("idle", 12), ("eat", 8), ("sleep", 6), ("hungry", 8),
          ("dead", 6), ("happy", 8), ("excited", 8), ("curious", 6)]


def load(path):
    a = np.asarray(Image.open(path).convert("RGBA"), dtype=np.float32) / 255.0
    return a[:, :, :3].copy(), a[:, :, 3].copy()


def save(rgb, alpha, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = np.clip(np.dstack([rgb, alpha]) * 255.0 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(path, optimize=True)
    return path


def un_composite(beauty_rgb, g_rgb, g_a):
    """Divide the front-glass layer back out of the beauty pass.

        full = glass.rgb*glass.a + bg.rgb*(1 - glass.a)

    inverted for bg.rgb. The inverse is ill-conditioned as glass.a approaches
    1: at the bowl's rim it amplifies sampling noise into a saturated colour
    fringe. Those pixels are fully covered by the glass layer anyway, so fade
    back to the undivided beauty there instead of trusting the division.
    """
    den = np.maximum(1.0 - g_a, 0.10)[:, :, None]
    divided = np.clip((beauty_rgb - g_rgb * g_a[:, :, None]) / den, 0.0, 1.0)
    t = np.clip((g_a - 0.45) / 0.40, 0.0, 1.0)
    t = (t * t * (3.0 - 2.0 * t))[:, :, None]
    return divided * (1.0 - t) + beauty_rgb * t


def over(s_rgb, s_a, d_rgb, d_a):
    """Straight-alpha source drawn on top of destination."""
    a = s_a + d_a * (1.0 - s_a)
    den = np.maximum(a, EPS)[:, :, None]
    rgb = (s_rgb * s_a[:, :, None]
           + d_rgb * (d_a * (1.0 - s_a))[:, :, None]) / den
    return rgb, a


def bbox(a, thr):
    ys, xs = np.nonzero(a > thr)
    if len(xs) == 0:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]


def build_bowl():
    b_rgb, b_a = load(os.path.join(STAGE, "bowl", "_bg_shadow.png"))
    c_rgb, c_a = load(os.path.join(STAGE, "bowl", "_bg_clean.png"))
    m_rgb, _ = load(os.path.join(STAGE, "bowl", "_mask.png"))
    g_rgb, g_a = load(os.path.join(STAGE, "bowl", "_glass.png"))
    h, w = c_a.shape

    # --- contact shadow: what only the catcher pass adds, re-laid with an
    #     elliptical falloff so it stays a local contact, not a frame wash ---
    raw = np.clip(b_a - c_a, 0.0, 1.0)
    x0, y0, x1, y1 = bbox(c_a, 0.02)
    bw = x1 - x0
    cx, cy = (x0 + x1) * 0.5, float(y1) - bw * 0.020
    rx, ry = bw * 0.60, bw * 0.135
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fall = np.clip(1.0 - (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2),
                   0.0, 1.0) ** 1.35
    s_a = raw * fall * SHADOW_OPACITY
    s_rgb = np.broadcast_to(SHADOW_TINT, (h, w, 3)).copy()

    # --- divide the front reflections back out (see un_composite) --------
    c_rgb = un_composite(c_rgb, g_rgb, g_a)

    bg_rgb, bg_a = over(c_rgb, c_a, s_rgb, s_a)      # bowl over its shadow
    save(bg_rgb, bg_a, os.path.join(DEST, "bowl", "bg.png"))

    # --- decor_front: cut straight out of the bg pixels by the near/far matte
    mask = np.clip(m_rgb[:, :, 0], 0.0, 1.0)
    d_a = bg_a * mask
    save(bg_rgb, d_a, os.path.join(DEST, "bowl", "decor_front.png"))

    # --- glass: front half of the shell, reflections on alpha --------------
    save(g_rgb, g_a, os.path.join(DEST, "bowl", "glass.png"))

    return {"size": [w, h], "shadow_centre": [round(cx, 1), round(cy, 1)],
            "shadow_radii": [round(rx, 1), round(ry, 1)],
            "max_shadow_alpha": round(float(s_a.max()), 4),
            "bg_border_alpha_max": round(float(max(
                bg_a[0].max(), bg_a[-1].max(),
                bg_a[:, 0].max(), bg_a[:, -1].max())), 4),
            "decor_coverage_pct": round(float((d_a > 0.5).mean()) * 100, 2),
            "glass_coverage_pct": round(float((g_a > 0.02).mean()) * 100, 2),
            "glass_max_alpha": round(float(g_a.max()), 3),
            "opaqueRect": bbox(bg_a, ALPHA_THRESHOLD),
            "opaqueRect_thr002": bbox(bg_a, 0.02)}


def build_memorial():
    """Same pipeline as bg, so memorial.png is a drop-in replacement for it:
    the glass is divided back out and the same art-directed contact shadow is
    laid under it, which keeps its alpha bounding box identical to bg's."""
    b_rgb, b_a = load(os.path.join(STAGE, "bowl", "_mem_shadow.png"))
    c_rgb, c_a = load(os.path.join(STAGE, "bowl", "_mem_clean.png"))
    g_rgb, g_a = load(os.path.join(STAGE, "bowl", "_glass.png"))
    h, w = c_a.shape

    c_rgb = un_composite(c_rgb, g_rgb, g_a)

    raw = np.clip(b_a - c_a, 0.0, 1.0)
    x0, y0, x1, y1 = bbox(c_a, 0.02)
    bw = x1 - x0
    cx, cy = (x0 + x1) * 0.5, float(y1) - bw * 0.020
    rx, ry = bw * 0.60, bw * 0.135
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fall = np.clip(1.0 - (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2),
                   0.0, 1.0) ** 1.35
    s_a = raw * fall * SHADOW_OPACITY
    s_rgb = np.broadcast_to(SHADOW_TINT, (h, w, 3)).copy()

    m_rgb, m_a = over(c_rgb, c_a, s_rgb, s_a)
    save(m_rgb, m_a, os.path.join(DEST, "bowl", "memorial.png"))

    bg_a = load(os.path.join(DEST, "bowl", "bg.png"))[1]
    return {"opaqueRect": bbox(m_a, ALPHA_THRESHOLD),
            "bg_opaqueRect": bbox(bg_a, ALPHA_THRESHOLD),
            "opaqueRect_matches_bg": bbox(m_a, ALPHA_THRESHOLD) == bbox(bg_a, ALPHA_THRESHOLD),
            "alpha_max_diff_vs_bg": round(float(np.abs(m_a - bg_a).max()), 4),
            "border_alpha_max": round(float(max(
                m_a[0].max(), m_a[-1].max(),
                m_a[:, 0].max(), m_a[:, -1].max())), 4)}


def check_decor_over_memorial():
    """decor_front is cut from bg. Confirm it still sits acceptably over the
    memorial backdrop, whose water is greyer."""
    d_rgb, d_a = load(os.path.join(DEST, "bowl", "decor_front.png"))
    m_rgb, _ = load(os.path.join(DEST, "bowl", "memorial.png"))
    m = d_a > 0.5
    e = np.abs(d_rgb - m_rgb)[m]
    return {"decor_px": int(m.sum()),
            "rgb_max_diff": round(float(e.max()), 4),
            "rgb_mean_diff": round(float(e.mean()), 5),
            "pct_within_8_255": round(float((e <= 8 / 255).mean()) * 100, 2)}


def _err(a_rgb, b_rgb, mask):
    e = np.abs(a_rgb - b_rgb)[mask]
    return {"max": round(float(e.max()), 4),
            "mean": round(float(e.mean()), 5),
            "p99": round(float(np.percentile(e, 99)), 4),
            "pct_within_2_255": round(float((e <= 2 / 255).mean()) * 100, 2),
            "pct_within_8_255": round(float((e <= 8 / 255).mean()) * 100, 2)}


def verify_layers():
    f_rgb, f_a = load(os.path.join(STAGE, "bowl", "_full.png"))
    n_rgb, _ = load(os.path.join(STAGE, "bowl", "_bg_shadow.png"))
    bg_rgb, bg_a = load(os.path.join(DEST, "bowl", "bg.png"))
    d_rgb, d_a = load(os.path.join(DEST, "bowl", "decor_front.png"))
    g_rgb, g_a = load(os.path.join(DEST, "bowl", "glass.png"))

    r1, a1 = over(d_rgb, d_a, bg_rgb, bg_a)            # bg + decor
    r2, a2 = over(g_rgb, g_a, r1, a1)                  # + glass

    # compare where the reference bowl is solid: this excludes both shadows,
    # which are deliberately different (the delivered one is art-directed)
    soll = f_a > 0.99
    swim = (f_a > 0.99) & (g_a < 0.35)

    save(r2, a2, os.path.join(STAGE, "bowl", "_composite.png"))
    err = np.clip(np.abs(r2 - f_rgb).max(axis=2) * 6.0, 0, 1)
    Image.fromarray((err * 255).astype(np.uint8)).save(
        os.path.join(STAGE, "bowl", "_diff.png"))

    return {
        "pixels_compared": int(soll.sum()),
        # two independent renders of the same scene: the sampling noise floor
        "noise_floor_bgpass_vs_full": _err(n_rgb, f_rgb, soll),
        # decor_front is cut from bg's own pixels, so this must be ~zero
        "bg_plus_decor_vs_full": _err(r1, f_rgb, soll),
        # the full three-layer stack; the glass layer is an intended addition
        "all_three_vs_full": _err(r2, f_rgb, soll),
        "alpha_max_diff_in_bowl": round(float(np.abs(a2 - f_a)[soll].max()), 4),
        "glass_alpha_in_bowl": {
            "mean": round(float(g_a[soll].mean()), 4),
            "median": round(float(np.percentile(g_a[soll], 50)), 4),
            "p90": round(float(np.percentile(g_a[soll], 90)), 4),
            "pct_over_0_5": round(float((g_a[soll] > 0.5).mean()) * 100, 2)},
        "swim_region_px": int(swim.sum()),
    }


def copy_fish():
    out = {}
    union = [10**9, 10**9, -1, -1]
    for name, count in STATES:
        src = sorted(glob.glob(os.path.join(STAGE, "fish", name, "*.png")))
        dst_dir = os.path.join(DEST, "fish", name)
        os.makedirs(dst_dir, exist_ok=True)
        rows, border = [], 0.0
        for i, f in enumerate(src, start=1):
            dst = os.path.join(dst_dir, "%s_%04d.png" % (name, i))
            shutil.copyfile(f, dst)
            _, a = load(dst)
            bb = bbox(a, 0.02)
            rows.append(bb)
            border = max(border, float(max(a[0].max(), a[-1].max(),
                                           a[:, 0].max(), a[:, -1].max())))
            union = [min(union[0], bb[0]), min(union[1], bb[1]),
                     max(union[2], bb[2]), max(union[3], bb[3])]
        ws = [b[2] - b[0] + 1 for b in rows]
        hs = [b[3] - b[1] + 1 for b in rows]
        out[name] = {"frames": len(rows), "w_range": [min(ws), max(ws)],
                     "h_range": [min(hs), max(hs)],
                     "border_alpha_max": round(border, 4),
                     "state_bbox": [min(b[0] for b in rows), min(b[1] for b in rows),
                                    max(b[2] for b in rows), max(b[3] for b in rows)]}
    out["_contentBox"] = union
    return out


if __name__ == "__main__":
    res = {}
    if glob.glob(os.path.join(STAGE, "bowl", "_bg_clean.png")):
        res["bowl"] = build_bowl()
        res["layer_verification"] = verify_layers()
    if glob.glob(os.path.join(STAGE, "bowl", "_mem_clean.png")):
        res["memorial"] = build_memorial()
        res["decor_over_memorial"] = check_decor_over_memorial()
    if glob.glob(os.path.join(STAGE, "fish", "*", "*.png")):
        res["fish"] = copy_fish()
    print(json.dumps(res, indent=1))
