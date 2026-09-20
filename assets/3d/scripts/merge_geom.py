"""Merge the 3D-projected geometry with the pixel-measured boxes and write
the two delivered geometry.json files.

    merge_geom.py <geom_dir> <dest_dir>
"""

import os
import sys
import glob
import json
import numpy as np
from PIL import Image

GEOM, DEST = sys.argv[1], sys.argv[2]
ALPHA_THRESHOLD = 0.5
STATES = ["idle", "eat", "sleep", "hungry", "dead", "happy", "excited", "curious"]


def alpha(path):
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.float32)[:, :, 3] / 255.0


def bbox(a, thr):
    ys, xs = np.nonzero(a > thr)
    if len(xs) == 0:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]


bowl = json.load(open(os.path.join(GEOM, "_geom_bowl.json")))
fish = json.load(open(os.path.join(GEOM, "_geom_fish.json")))

# ---- opaqueRect: alpha bbox of the delivered bg.png -----------------------
bg_a = alpha(os.path.join(DEST, "bowl", "bg.png"))
bowl["opaqueRect"] = bbox(bg_a, ALPHA_THRESHOLD)
bowl["opaqueRectAlphaThreshold"] = ALPHA_THRESHOLD
bowl["opaqueRect_note"] = (
    "alpha bounding box of bg.png at alpha > %.2f; the soft contact shadow "
    "falls below this threshold, so this rect is the bowl and stand, not the "
    "shadow" % ALPHA_THRESHOLD)
bowl["_pixelMeasured"] = ["opaqueRect"]
bowl["_projected"] = ["waterlineY", "floorY", "innerEllipse"]

# ---- contentBox: union alpha bbox over every frame of every state ---------
union = [10 ** 9, 10 ** 9, -1, -1]
per_state = {}
for name in STATES:
    files = sorted(glob.glob(os.path.join(DEST, "fish", name, "*.png")))
    if not files:
        continue
    s = [10 ** 9, 10 ** 9, -1, -1]
    for f in files:
        b = bbox(alpha(f), 0.02)
        s = [min(s[0], b[0]), min(s[1], b[1]), max(s[2], b[2]), max(s[3], b[3])]
    per_state[name] = s
    union = [min(union[0], s[0]), min(union[1], s[1]),
             max(union[2], s[2]), max(union[3], s[3])]

fish["contentBox"] = union
fish["contentBoxAlphaThreshold"] = 0.02
fish["contentBox_perState"] = per_state
fish["contentBox_note"] = (
    "union alpha bounding box across every frame of every state; crop all "
    "frames to this single box and nothing clips")
fish["bodyBox_note"] = (
    "projected bounds of HERO_fish_body alone, fins and tail excluded, "
    "unioned over every frame of every state; intended as the collision box, "
    "deliberately smaller than contentBox")
fish["_pixelMeasured"] = ["contentBox"]
fish["_projected"] = ["bodyBox", "anchor"]

os.makedirs(os.path.join(DEST, "bowl"), exist_ok=True)
os.makedirs(os.path.join(DEST, "fish"), exist_ok=True)
json.dump(bowl, open(os.path.join(DEST, "bowl", "geometry.json"), "w"), indent=1)
json.dump(fish, open(os.path.join(DEST, "fish", "geometry.json"), "w"), indent=1)
print(json.dumps({"bowl": bowl, "fish": fish}, indent=1))
