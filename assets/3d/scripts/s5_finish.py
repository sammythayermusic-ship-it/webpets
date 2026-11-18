"""Step 5: install frog.py's and chicken.py's renders and write their manifest entries.

    python3 assets/3d/scripts/s5_finish.py <stage_dir> frog|chicken [...]

<stage_dir>/frog-full and <stage_dir>/chicken-full are the scripts' output folders.

Everything a number can be measured for is measured here, not typed: each habitat's opaqueRect is the
alpha bounding box of its bg plate, each light set's tint is its plate's mean colour over the day
plate's, and each sprite's body box comes from its own silhouettes. A sprite state's anchor is NOT
measured: every state of a pet is shot by one fixed camera with the rig standing in one place, so the
frames are registered as rendered, and an anchor only undoes a shift this script itself applied
(or puts the fallen pose down on the ground: see `sprite`). The positions the behaviours go to come from the Blender scripts'
geom files (projected model points). The result is also written to assets/habitats/.../geometry.json
so the species layouts (src/species/*/layout.ts) have one place to read from.
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ASSETS = os.path.join(REPO, "assets")
STAGE = sys.argv[1]
WHAT = sys.argv[2:] or ["frog", "chicken"]
VARIANTS = ("dawn", "dusk", "night")
FRAME = 80


def copy(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)


def alpha_bbox(path):
    a = np.asarray(Image.open(path).convert("RGBA"))[..., 3]
    ys, xs = np.where(a >= 128)
    k = a.shape[1] // 320
    x0, y0 = int(xs.min() // k), int(ys.min() // k)
    x1, y1 = int(-(-(xs.max() + 1) // k)), int(-(-(ys.max() + 1) // k))
    return {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}


def tint(day_path, var_path):
    a = np.asarray(Image.open(day_path).convert("RGBA")).astype(np.float64)
    b = np.asarray(Image.open(var_path).convert("RGBA")).astype(np.float64)
    m = (a[..., 3] > 200) & (b[..., 3] > 200)
    ra, rb = a[..., :3][m].mean(axis=0), b[..., :3][m].mean(axis=0)
    return [round(float(min(1.0, x)), 3) for x in rb / np.maximum(ra, 1.0)]


FEATHER = 20  # grid px


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def feather_shadow(day_path, path):
    """Fade a plate's cast shadow out before it reaches the edge of the frame.

    At dawn and dusk the sun is low and the shadow is longer than the 320x240 frame, which cut it off
    in a straight line: a dark rectangle's corner on the desktop. The shadow's alpha now eases to zero
    over the last FEATHER grid px. Only the shadow: the habitat itself (where the DAY plate is solid,
    the same shape in every light) is left exactly as rendered.
    """
    day = np.asarray(Image.open(day_path).convert("RGBA")).astype(np.float32)[..., 3] / 255
    im = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    h, w = im.shape[:2]
    m = FEATHER * w / 320
    fx = smoothstep(0.0, 1.0, np.minimum(np.arange(w), w - 1 - np.arange(w)) / m)
    fy = smoothstep(0.0, 1.0, np.minimum(np.arange(h), h - 1 - np.arange(h)) / m)
    f = fy[:, None] * fx[None, :]
    solid = smoothstep(0.35, 0.6, day)
    im[..., 3] *= solid + (1 - solid) * f
    Image.fromarray(np.clip(im + 0.5, 0, 255).astype(np.uint8)).save(path, optimize=True)


def bottom(path):
    """The lowest solid row of a frame, texels."""
    a = np.asarray(Image.open(path).convert("RGBA"))[..., 3]
    return int(np.where(a > 128)[0].max())


def sil(path):
    """Silhouette box of one frame, logical px: (w, h, centre x offset from the frame centre)."""
    a = np.asarray(Image.open(path).convert("RGBA"))[..., 3]
    ys, xs = np.where(a > 2)
    k = a.shape[1] / FRAME
    return (xs.max() - xs.min() + 1) / k, (ys.max() - ys.min() + 1) / k, ((xs.min() + xs.max() + 1) / 2) / k - FRAME / 2


def habitat(man, species, hab, src, layers, ambient, extra_geom):
    dst = os.path.join(ASSETS, "habitats", species, hab)
    rel = f"habitats/{species}/{hab}"
    for layer in layers:
        copy(os.path.join(src, "day", f"{layer}.png"), os.path.join(dst, f"{layer}.png"))
        for v in VARIANTS:
            copy(os.path.join(src, v, f"{layer}.png"), os.path.join(dst, f"{layer}_{v}.png"))
    copy(os.path.join(src, "memorial", "bg.png"), os.path.join(dst, "memorial.png"))
    opaque = alpha_bbox(os.path.join(dst, "bg.png"))
    tints = {v: tint(os.path.join(dst, "bg.png"), os.path.join(dst, f"bg_{v}.png")) for v in VARIANTS}
    for v in VARIANTS:
        feather_shadow(os.path.join(src, "day", "bg.png"), os.path.join(dst, f"bg_{v}.png"))
    feather_shadow(os.path.join(src, "day", "bg.png"), os.path.join(dst, "bg.png"))
    feather_shadow(os.path.join(src, "day", "bg.png"), os.path.join(dst, "memorial.png"))
    assert alpha_bbox(os.path.join(dst, "bg.png")) == opaque

    def lay(name):
        d = {"name": name, "file": f"{rel}/{name}.png", "z": 0}
        for v in VARIANTS:
            d[v] = f"{rel}/{name}_{v}.png"
        return d
    order = [lay("bg"), {"name": "memorial", "file": f"{rel}/memorial.png", "z": 0}, {"name": "pet", "z": 0},
             {"name": "food", "z": 0}, {"name": "fx", "z": 0}]
    for name in ("decor_front", "glass"):
        if name in layers:
            order.append(lay(name))
            if name == "glass":
                # see-through: its light sets fade into each other (ManifestLayer.translucent)
                order[-1]["translucent"] = True
    g = extra_geom
    stand = g["standY"]
    walk = g["walk"]
    amb = {"tints": tints}
    amb.update(ambient)
    # The pet's contact shadow: as wide as its body, flat, under its soles (the rig's origin stands
    # `feet` grid px above them).
    body, feet = g["body"], g.pop("feet")
    amb["shadow"] = {"w": round(body["w"] * 0.92, 1), "h": round(min(10.0, max(6.0, body["w"] * 0.3)), 1), "below": round(feet - 0.5, 1)}
    man["habitats"][f"{species}/{hab}"] = {
        "grid": [320, 240],
        "layers": order,
        # a line of ground, flattened to satisfy the schema's water shape, as the hamster homes do
        "water": {"x": walk[0], "y": stand, "w": walk[1] - walk[0], "h": 1},
        "waterShape": {"cx": (walk[0] + walk[1]) / 2, "cy": stand, "rx": (walk[1] - walk[0]) / 2, "ry": 1, "surfaceY": stand, "floorY": stand},
        "petAnchor": g["anchor"],
        "opaqueRect": opaque,
        "ambient": amb,
    }
    out = {"opaqueRect": opaque, **g}
    with open(os.path.join(dst, "geometry.json"), "w") as fh:
        json.dump(out, fh, indent=1)
        fh.write("\n")
    print(f"{species}/{hab}: opaqueRect {opaque} tints {tints}", flush=True)


def sprite(man, key, src, folder, states, stride=None):
    """states: [(name, frames, loop, returnTo)]."""
    dst = os.path.join(ASSETS, "sprites", folder)
    shutil.rmtree(dst, ignore_errors=True)
    for name, n, _, _ in states:
        for i in range(n):
            copy(os.path.join(src, name, f"{name}_{i + 1:04d}.png"), os.path.join(dst, name, f"{name}_{i + 1:04d}.png"))
    k = Image.open(os.path.join(dst, "idle", "idle_0001.png")).width / FRAME
    # Centre the set on the frame. The player mirrors a sprite about its frame centre, so a drawing
    # that sits off it jumps sideways by twice the offset at every turn; the rigs are turned 50
    # degrees toward the camera, which swings head and shoulders off the rig's own axis. One whole
    # number of texels for the whole set, so the states keep their registration to each other.
    offs = [sil(os.path.join(dst, name, f"{name}_0001.png"))[2] for name, _, _, _ in states]
    shift = -int(round((min(offs) + max(offs)) / 2 * k))
    if shift != 0:
        for name, n, _, _ in states:
            for i in range(n):
                fp = os.path.join(dst, name, f"{name}_{i + 1:04d}.png")
                a = np.asarray(Image.open(fp).convert("RGBA"))
                edge = a[:, -shift:, 3] if shift > 0 else a[:, :(-shift), 3]
                assert edge.max() == 0 or np.roll(a, shift, axis=1)[..., 3].sum() == a[..., 3].sum()
                Image.fromarray(np.roll(a, shift, axis=1)).save(fp, optimize=True)
        print(f"sprite {key}: centred by {shift / k:+.2f} px", flush=True)
    # A pose that leans or lies (the fallen one, the hen scratching) still sits off the centre the
    # standing ones share. Each such state is centred by itself: what registers it to the others is
    # its anchor, measured below, after this. Not the states the pet moves or turns through, whose
    # frames must keep their place against the standing pose's.
    rolled = {}
    for name, n, _, _ in states:
        if name in ("idle", "walk", "turn", "die"):
            continue
        own = -int(round(sil(os.path.join(dst, name, f"{name}_0001.png"))[2] * k))
        if abs(own) > 2.5 * k:
            rolled[name] = own / k
            for i in range(n):
                fp = os.path.join(dst, name, f"{name}_{i + 1:04d}.png")
                a = np.asarray(Image.open(fp).convert("RGBA"))
                assert np.roll(a, own, axis=1)[..., 3].sum() == a[..., 3].sum()
                Image.fromarray(np.roll(a, own, axis=1)).save(fp, optimize=True)
            print(f"sprite {key}: {name} centred by a further {own / k:+.2f} px", flush=True)

    out = {}
    boxes = {}
    for name, n, loop, ret in states:
        st = {"source": {"kind": "sequence", "files": [f"sprites/{folder}/{name}/{name}_{i + 1:04d}.png" for i in range(n)]},
              "frames": n, "sequence": list(range(n)), "loop": loop,
              # Registered as rendered (one camera, one standing place). A state this script moved in
              # its frame is drawn back by the same amount: the player draws at minus the anchor.
              "anchor": [round(rolled.get(name, 0.0), 2), 0.0]}
        if ret:
            st["returnTo"] = ret
        if stride and name in stride:
            st["stridePx"] = stride[name]
        out[name] = st
        boxes[name] = sil(os.path.join(dst, name, f"{name}_0001.png"))
    # The one pose the camera cannot register is the fallen one. The rig rolls over about its own
    # origin, which stands above the ground, so a body on its back is rendered hanging in the air
    # (the frog, 12 px up). It is put down: the lowest point of the fallen body goes where the lowest
    # point of the standing one was, and the fall walks down to it frame by frame.
    if "dead" in out and "idle" in out:
        drop = (bottom(os.path.join(dst, "dead", "dead_0001.png")) - bottom(os.path.join(dst, "idle", "idle_0001.png"))) / k
        # Only a body left in the air. One lying lower than it stood is lying on ground nearer the
        # camera (the birds), which is where it fell.
        drop = min(0.0, drop)
        out["dead"]["anchor"][1] = round(drop, 2)
        if "die" in out and drop < 0:
            n = out["die"]["frames"]
            out["die"]["offsets"] = [[0.0, round(-drop * (i / (n - 1)) ** 2, 3)] for i in range(n)]
        print(f"sprite {key}: the fallen pose is put down by {-drop:+.2f} px", flush=True)
    if "die" in out and "dead" in out:
        out["dead"]["enterVia"] = "die"
    ws = [b[0] for b in boxes.values()]
    hs = [b[1] for b in boxes.values()]
    body = {"w": int(max(min(ws) - 3, max(ws) - 23)), "h": int(max(min(hs) - 3, max(hs) - 23))}
    man["sprites"][key] = {"frame": [FRAME, FRAME], "fps": 12, "body": body, "states": out}
    print(f"sprite {key}: body {body}; widths {min(ws):.1f}..{max(ws):.1f}, heights {min(hs):.1f}..{max(hs):.1f}; "
          f"x offsets {', '.join(f'{n}:{b[2]:+.1f}' for n, b in boxes.items())}", flush=True)
    return body


def main():
    man_path = os.path.join(ASSETS, "manifest.json")
    man = json.load(open(man_path))
    # the mouth: measured off the snap frames (the red of the open mouth), from the frame centre
    FIRE = {"fireflies": {"count": 7}, "tongue": {"mouth": [16, 6]}}
    if "frog" in WHAT:
        src = os.path.join(STAGE, "frog-full")
        g = json.load(open(os.path.join(src, "frog-geom.json")))
        body = sprite(man, "frog", os.path.join(src, "frog"), "frog",
                      [("idle", 8, True, None), ("croak", 8, True, None), ("hop", 6, False, "idle"), ("snap", 4, False, "idle"),
                       ("hungry", 6, True, None), ("sleep", 6, True, None), ("dead", 1, True, None), ("die", 6, False, "dead"),
                       ("turn", 7, False, None)])
        # The rig's origin is 0.0185 m above its soles: 11.2 grid px at this pitch (frog.py's FEET_Z x scale).
        up = 11.2
        for hab, layers in (("pond", ["bg"]), ("jar", ["bg", "glass"])):
            p = g[hab]
            sites = {"pad": [round(p["pad"][0], 1), round(p["pad"][1] - up, 1)], "rock": [round(p["rock"][0], 1), round(p["rock"][1] - up, 1)]}
            bank = {"x0": round(p["bankLeft"][0], 1), "x1": round(p["bankRight"][0], 1), "y": round(p["bankMid"][1], 1)}
            w = p["water"]
            extra = {"standY": round(sites["pad"][1]), "walk": [round(min(sites["pad"][0], sites["rock"][0]) - 4), round(max(sites["pad"][0], sites["rock"][0]) + 4)],
                     "anchor": [round(sites["pad"][0]), round(sites["pad"][1])], "sites": sites, "bank": bank, "body": body, "feet": up}
            amb = dict(FIRE)
            amb["air"] = {"x": round(w["x"] - 6, 1), "y": round(w["y"] - 46, 1), "w": round(w["w"] + 12, 1), "h": round(w["h"] + 40, 1)}
            habitat(man, "frog", hab, os.path.join(src, hab), layers, amb, extra)
    if "chicken" in WHAT:
        src = os.path.join(STAGE, "chicken-full")
        g = json.load(open(os.path.join(src, "chicken-geom.json")))
        hen = sprite(man, "chicken", os.path.join(src, "hen"), "chicken/hen",
                     [("idle", 8, True, None), ("walk", 8, True, None), ("eat", 6, False, "idle"), ("sleep", 6, True, None),
                      ("hungry", 6, True, None), ("dead", 1, True, None), ("die", 6, False, "dead"), ("turn", 7, False, None),
                      ("scratch", 6, True, None), ("dustbathe", 8, True, None)], stride={"walk": 9.0})
        chick = sprite(man, "chicken/brooder", os.path.join(src, "chick"), "chicken/chick",
                       [("idle", 8, True, None), ("walk", 8, True, None), ("eat", 6, False, "idle"), ("sleep", 6, True, None),
                        ("hungry", 6, True, None), ("dead", 1, True, None), ("die", 6, False, "dead"), ("turn", 7, False, None)],
                       stride={"walk": 6.7})
        # how far each rig's origin stands above its soles, grid px: feet (m) x cos(34 deg) / 0.001375
        b = g["brooder"]
        up = 0.0202 * 0.829 / 0.001375 - 0.0020 * 0.829 / 0.001375
        stand = round(b["floorLeft"][1] - up, 1)
        extra = {"standY": round(stand), "walk": [round(b["floorLeft"][0]), round(b["floorRight"][0])], "anchor": [160, round(stand)],
                 "sites": {"lamp": [round(b["lamp"][0], 1), stand], "feeder": [round(b["feeder"][0], 1), stand], "water": [round(b["water"][0], 1), stand]},
                 "foodRow": round(b["foodRow"][1], 1), "body": chick, "feet": up}
        amb = {"lamp": {"at": [round(b["bulb"][0], 1), round(b["bulb"][1], 1)], "radius": 34},
               "air": {"x": 60, "y": 60, "w": 200, "h": 80},
               "critter": {"kind": "moth", "frames": [f"critters/moth/f_{i:02d}.png" for i in range(4)], "size": [17, 14.4], "fps": 22},
               "hood": [[round(b["bulb"][0] - 18, 1), round(b["bulb"][1] + 2, 1)], [round(b["bulb"][0] + 18, 1), round(b["bulb"][1] + 2, 1)]]}
        habitat(man, "chicken", "brooder", os.path.join(src, "brooder"), ["bg", "decor_front"], amb, extra)
        c = g["coop"]
        up = (0.0346 - 0.0033) * 0.80 * 0.829 / 0.001375
        stand = round(c["floorLeft"][1] - up, 1)
        extra = {"standY": round(stand), "walk": [round(c["floorLeft"][0]), round(c["floorRight"][0])], "anchor": [170, round(stand)],
                 "sites": {"door": [round(c["door"][0], 1), stand], "feeder": [round(c["feeder"][0], 1), stand], "dust": [round(c["dust"][0], 1), stand]},
                 "foodRow": round(c["foodRow"][1], 1), "body": hen, "feet": up}
        d = c["doorRect"]
        amb = {"door": {"x": d["x"], "y": d["y"], "w": d["w"], "h": d["h"]},
               "doorGlow": True,
               "nest": [[round(p[0], 1), round(p[1], 1)] for p in c["nest"]],
               "air": {"x": 70, "y": 70, "w": 190, "h": 70}}
        habitat(man, "chicken", "coop", os.path.join(src, "coop"), ["bg", "decor_front"], amb, extra)
    with open(man_path, "w") as fh:
        json.dump(man, fh, indent=2)
        fh.write("\n")
    print("manifest written", flush=True)


if __name__ == "__main__":
    main()
