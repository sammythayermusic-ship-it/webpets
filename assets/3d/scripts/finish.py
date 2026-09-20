"""Finish the WebPets 3D renders.

- Isolates the rendered contact shadow from a clean bowl matte and re-lays it
  under the bowl with an elliptical falloff, so the shadow stays a soft local
  contact instead of a full-frame ambient wash.
- Copies the fish sequences into the repo with 1-based frame numbering.
- Verifies alpha and per-frame size/centre consistency.
"""

import os
import glob
import shutil
import sys
import numpy as np
from PIL import Image

STAGE = sys.argv[1]
DEST = sys.argv[2]

SHADOW_OPACITY = 0.52
SHADOW_TINT = np.array([0.055, 0.060, 0.080], dtype=np.float32)  # soft cool dark


def load(path):
    a = np.asarray(Image.open(path).convert("RGBA"), dtype=np.float32) / 255.0
    return a[:, :, :3], a[:, :, 3]


def save(rgb, alpha, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = np.clip(np.dstack([rgb, alpha]) * 255.0 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(path, optimize=True)
    return path


def finish_bowl():
    b_rgb, b_a = load(os.path.join(STAGE, "bowl", "_bowl_shadow.png"))
    a_rgb, a_a = load(os.path.join(STAGE, "bowl", "_bowl_clean.png"))
    h, w = a_a.shape

    # the bowl's own matte, and the shadow that only the catcher pass adds
    shadow = np.clip(b_a - a_a, 0.0, 1.0)

    ys, xs = np.nonzero(a_a > 0.02)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    bowl_w = x1 - x0
    cx = (x0 + x1) * 0.5
    cy = float(y1) - bowl_w * 0.020            # sit just under the feet
    rx = bowl_w * 0.60
    ry = bowl_w * 0.135

    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    falloff = np.clip(1.0 - d, 0.0, 1.0) ** 1.35

    s_a = shadow * falloff * SHADOW_OPACITY
    s_rgb = np.broadcast_to(SHADOW_TINT, (h, w, 3))

    out_a = a_a + s_a * (1.0 - a_a)
    denom = np.maximum(out_a, 1e-6)[:, :, None]
    out_rgb = (a_rgb * a_a[:, :, None]
               + s_rgb * (s_a * (1.0 - a_a))[:, :, None]) / denom

    p = save(out_rgb, out_a, os.path.join(DEST, "bowl", "bowl.png"))
    return {"path": p, "size": (w, h), "bowl_bbox": (x0, y0, x1, y1),
            "shadow_centre": (round(cx, 1), round(cy, 1)),
            "shadow_radii": (round(rx, 1), round(ry, 1)),
            "border_alpha_max": round(float(max(
                out_a[0].max(), out_a[-1].max(),
                out_a[:, 0].max(), out_a[:, -1].max())), 4),
            "max_shadow_alpha": round(float(s_a.max()), 4)}


def copy_seq(name, src_glob, dest_dir):
    files = sorted(glob.glob(os.path.join(STAGE, src_glob)))
    os.makedirs(os.path.join(DEST, dest_dir), exist_ok=True)
    rows = []
    for i, f in enumerate(files, start=1):
        dst = os.path.join(DEST, dest_dir, "%s_%04d.png" % (name, i))
        shutil.copyfile(f, dst)
        rgb, a = load(dst)
        ys, xs = np.nonzero(a > 0.02)
        rows.append({
            "frame": i,
            "bbox": (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())),
            "wh": (int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)),
            "border_alpha_max": round(float(max(
                a[0].max(), a[-1].max(), a[:, 0].max(), a[:, -1].max())), 4),
            "coverage_pct": round(float((a > 0.02).mean()) * 100, 2),
        })
    ws = [r["wh"][0] for r in rows]
    hs = [r["wh"][1] for r in rows]
    cxs = [(r["bbox"][0] + r["bbox"][2]) / 2 for r in rows]
    cys = [(r["bbox"][1] + r["bbox"][3]) / 2 for r in rows]
    return {"name": name, "frames": len(rows),
            "w_range": (min(ws), max(ws)), "h_range": (min(hs), max(hs)),
            "centre_x_range": (round(min(cxs), 1), round(max(cxs), 1)),
            "centre_y_range": (round(min(cys), 1), round(max(cys), 1)),
            "border_alpha_max": max(r["border_alpha_max"] for r in rows),
            "rows": rows}


if __name__ == "__main__":
    import json
    res = {"bowl": finish_bowl()}
    for nm, g, d in (("idle", "fish/idle/idle_*.png", "fish/idle"),
                     ("eat", "fish/eat/eat_*.png", "fish/eat"),
                     ("sleep", "fish/sleep/sleep_*.png", "fish/sleep")):
        if glob.glob(os.path.join(STAGE, g)):
            r = copy_seq(nm, g, d)
            r.pop("rows")
            res[nm] = r
    print(json.dumps(res, indent=1))
