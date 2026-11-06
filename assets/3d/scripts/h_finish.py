"""Step 3: turn h_plates.py's renders into the delivered assets and the manifest entries.

    python3 assets/3d/scripts/h_finish.py <stage_dir>

<stage_dir> is h_plates.py's <out_dir>. Writes, under assets/:
  habitats/hamster/{terrarium,cage}/   bg, decor_front (and glass) for day + _dawn, _dusk, _night;
                                       memorial; wheel/f_NN.png (the day frames of the wheel's turn)
  habitats/fish/bowl/plants.png        the plant mask
  critters/{snail,moth}/f_NN.png       the two background creatures
and updates assets/manifest.json: the variant keys on the hamster homes' layers, each habitat's
`ambient` block (positions from the renders' geom.json), the bowl's `live.plants`.

The tints are MEASURED, not chosen: for each light set, the mean colour of the opaque pixels divided
by the day render's, channel by channel. Code-drawn things (motes, drops, the snail) take the habitat's
tint; the wheel's day frames take the wheel's own, so one set of frames serves all four lights.
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

STAGE = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/webpets/stage-h/full")
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ASSETS = os.path.join(REPO, "assets")
VARIANTS = ("dawn", "dusk", "night")

# Matches h_plates.HABITATS: the grid rect the wheel frames were cropped to.
WHEEL = {
    "terrarium": {"rect": (98, 36, 76, 74), "loopDeg": 360.0 / 22.0},
    "cage": {"rect": (52, 56, 90, 90), "loopDeg": 180.0},
}
# Where dust drifts: the open air inside each home, above the bedding (grid px).
AIR = {"terrarium": (26, 30, 238, 80), "cage": (50, 24, 236, 100)}


def tint(day_path, var_path):
    a = np.asarray(Image.open(day_path).convert("RGBA")).astype(np.float64)
    b = np.asarray(Image.open(var_path).convert("RGBA")).astype(np.float64)
    m = (a[..., 3] > 200) & (b[..., 3] > 200)
    ra = a[..., :3][m].mean(axis=0)
    rb = b[..., :3][m].mean(axis=0)
    return [round(float(min(1.0, x)), 3) for x in rb / np.maximum(ra, 1.0)]


def tints(day_path, paths):
    return {v: tint(day_path, paths[v]) for v in VARIANTS}


def copy(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)


def alpha_bbox(path):
    a = np.asarray(Image.open(path).convert("RGBA"))[..., 3]
    ys, xs = np.where(a >= 128)
    k = a.shape[1] // 320
    return {"x": int(xs.min() // k), "y": int(ys.min() // k),
            "w": int(-(-(xs.max() + 1) // k) - xs.min() // k), "h": int(-(-(ys.max() + 1) // k) - ys.min() // k)}


def main():
    geom = json.load(open(os.path.join(STAGE, "geom.json")))
    man_path = os.path.join(ASSETS, "manifest.json")
    man = json.load(open(man_path))

    for hab in ("terrarium", "cage"):
        src = os.path.join(STAGE, hab)
        dst = os.path.join(ASSETS, "habitats", "hamster", hab)
        rel = f"habitats/hamster/{hab}"
        layers = ["bg", "decor_front"] + (["glass"] if hab == "terrarium" else [])
        for layer in layers:
            copy(os.path.join(src, "day", f"{layer}.png"), os.path.join(dst, f"{layer}.png"))
            for v in VARIANTS:
                copy(os.path.join(src, v, f"{layer}.png"), os.path.join(dst, f"{layer}_{v}.png"))
        copy(os.path.join(src, "memorial", "bg.png"), os.path.join(dst, "memorial.png"))
        # the wheel: day frames only (see the module docstring)
        wdst = os.path.join(dst, "wheel")
        shutil.rmtree(wdst, ignore_errors=True)
        frames = sorted(f for f in os.listdir(os.path.join(src, "wheel", "day")) if f.endswith(".png"))
        for f in frames:
            copy(os.path.join(src, "wheel", "day", f), os.path.join(wdst, f))
        wheel_t = tints(os.path.join(src, "wheel", "day", frames[0]),
                        {v: os.path.join(src, "wheel", v, frames[0]) for v in VARIANTS})
        hab_t = tints(os.path.join(src, "day", "bg.png"), {v: os.path.join(src, v, "bg.png") for v in VARIANTS})

        h = man["habitats"][f"hamster/{hab}"]
        for l in h["layers"]:
            if l["name"] in layers:
                for v in VARIANTS:
                    l[v] = f"{rel}/{l['name']}_{v}.png"
        g = geom[hab]
        x, y, w, hh = WHEEL[hab]["rect"]
        sx, sy = g["spoutTip"]
        amb = {
            "tints": hab_t,
            "wheel": {
                "rect": {"x": x, "y": y, "w": w, "h": hh},
                "loopDeg": round(WHEEL[hab]["loopDeg"], 4),
                "frames": [f"{rel}/wheel/{f}" for f in frames],
                "hub": [round(g["wheelHub"][0], 2), round(g["wheelHub"][1], 2)],
                "tints": wheel_t,
            },
            "bottle": {"spout": [round(sx, 2), round(sy, 2)],
                       "water": {k: round(v, 1) for k, v in g["bottleWater"].items()},
                       "dropTo": round(sy + 9, 1)},
            "hood": [[round(p[0], 2), round(p[1], 2)] for p in g["hood"]],
            "air": dict(zip(("x", "y", "w", "h"), AIR[hab])),
            "critter": {"kind": "moth", "frames": [f"critters/moth/f_{i:02d}.png" for i in range(4)],
                        "size": [17, 14.4], "fps": 22},
        }
        if "door" in g:
            amb["door"] = {k: round(v, 1) for k, v in g["door"].items()}
        h["ambient"] = amb
        bb = alpha_bbox(os.path.join(dst, "bg.png"))
        print(hab, "opaqueRect manifest", h["opaqueRect"], "measured", bb, flush=True)

    # the bowl: its plant mask, its snail, its tints
    copy(os.path.join(STAGE, "bowl", "plants.png"), os.path.join(ASSETS, "habitats", "fish", "bowl", "plants.png"))
    bowl = man["habitats"]["fish/bowl"]
    bowl["live"]["plants"] = "habitats/fish/bowl/plants.png"
    bdir = os.path.join(ASSETS, "habitats", "fish", "bowl")
    ws = bowl["waterShape"]
    bowl["ambient"] = {
        "tints": tints(os.path.join(bdir, "bg.png"), {v: os.path.join(bdir, f"bg_{v}.png") for v in VARIANTS}),
        "critter": {
            "kind": "snail",
            "frames": [f"critters/snail/f_{i:02d}.png" for i in range(4)],
            "size": [18, 12],
            "fps": 0.7,
            # on the glass, under the water, clear of the gravel: a flat loop round the lower bowl
            "path": {"cx": ws["cx"], "cy": round((ws["surfaceY"] + ws["floorY"]) / 2 + 6, 1),
                     "rx": round(ws["rx"] * 0.6, 1), "ry": 13},
        },
    }

    for kind in ("snail", "moth"):
        src = os.path.join(STAGE, "critters", kind)
        for f in sorted(os.listdir(src)):
            copy(os.path.join(src, f), os.path.join(ASSETS, "critters", kind, f))

    with open(man_path, "w") as fh:
        json.dump(man, fh, indent=2)
        fh.write("\n")
    print("manifest written", flush=True)


if __name__ == "__main__":
    main()
