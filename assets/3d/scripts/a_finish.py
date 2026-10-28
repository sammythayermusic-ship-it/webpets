"""Bake-off candidate A: turn the a_render.py stage into shipped art and the manifest entries.

    python3 assets/3d/scripts/a_finish.py <stage_dir> <assets_dir> [--loop video|frames|mov|none] [--no-encode]

Plain python3 with numpy + Pillow + ffmpeg (/opt/homebrew/bin/ffmpeg), like finish2.py, whose bowl
maths this repeats exactly (contact shadow isolated and re-laid with an elliptical falloff, front
glass divided back out of the beauty pass, decor_front cut from bg by the near/far matte).

What is new:
  night plates   bg_night / decor_front_night / glass_night from the _n* passes, same maths
  the water loop every loop frame is un-composited against the DAY glass pass (the night loop
                 against the night glass), cropped to REGION, and delivered three ways so the app
                 can be measured with each: a PNG sequence, an opaque H.264 mp4, an HEVC-with-alpha
                 mov. `--loop` says which one the manifest points at.
  fish at 24 fps frames copied, per-state registration anchors re-measured the way
                 src/render/habitatArt.test.ts measures them (alpha-weighted centroid of each state
                 relative to idle, in grid px), geometry.json fps updated.
"""

import glob
import json
import os
import shutil
import subprocess
import sys
import numpy as np
from PIL import Image

STAGE = sys.argv[1]
ASSETS = sys.argv[2]
LOOP_KIND = "video"
ENCODE = True
for i, a in enumerate(sys.argv):
    if a == "--loop":
        LOOP_KIND = sys.argv[i + 1]
    if a == "--no-encode":
        ENCODE = False

FFMPEG = "/opt/homebrew/bin/ffmpeg"
BOWL = os.path.join(ASSETS, "habitats", "fish", "bowl")
FISH = os.path.join(ASSETS, "sprites", "fish")
ART = 4                        # art px per grid px
FPS = 24
SHADOW_OPACITY = 0.52
SHADOW_TINT = np.array([0.055, 0.060, 0.080], dtype=np.float32)
ALPHA_THRESHOLD = 0.5
EPS = 1e-6
# The crop the loop ships as: the inside of the glass, in art px, every edge a multiple of ART so
# the region is whole grid px. From geometry.json's innerEllipse (640, 403.7, 330.2, 326.2).
REGION = (308, 76, 664, 656)
# The runtime clip, grid px: the inner ellipse pulled in half a px so the crop's edge never shows.
MASK = {"cx": 160.0, "cy": 100.9, "rx": 82.0, "ry": 81.0}
STATES = [("idle", 24), ("eat", 16), ("sleep", 12), ("hungry", 16),
          ("dead", 12), ("happy", 16), ("excited", 16), ("curious", 12)]


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


def contact_shadow(b_a, c_a):
    """The catcher pass's extra alpha, re-laid with the elliptical falloff finish2.py uses."""
    h, w = c_a.shape
    raw = np.clip(b_a - c_a, 0.0, 1.0)
    x0, y0, x1, y1 = bbox(c_a, 0.02)
    bw = x1 - x0
    cx, cy = (x0 + x1) * 0.5, float(y1) - bw * 0.020
    rx, ry = bw * 0.60, bw * 0.135
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fall = np.clip(1.0 - (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2), 0.0, 1.0) ** 1.35
    s_a = raw * fall * SHADOW_OPACITY
    s_rgb = np.broadcast_to(SHADOW_TINT, (h, w, 3)).copy()
    return s_rgb, s_a


def clean_plate(prefix, loop_dir):
    """The clean beauty pass, rendered AT the loop's first frame (a_render.py), so the still bowl
    and loop frame 1 are the same picture up to denoiser noise. The loop frames themselves are
    border renders (empty outside the water region) and cannot stand in for the whole plate."""
    return load(os.path.join(STAGE, "bowl", prefix + "bg_clean.png"))


def build_bowl(prefix, suffix, loop_dir):
    b_rgb, b_a = load(os.path.join(STAGE, "bowl", prefix + "bg_shadow.png"))
    c_rgb, c_a = clean_plate(prefix, loop_dir)
    m_rgb, _ = load(os.path.join(STAGE, "bowl", "_mask.png"))
    g_rgb, g_a = load(os.path.join(STAGE, "bowl", prefix + "glass.png"))
    s_rgb, s_a = contact_shadow(b_a, c_a)
    c_rgb = un_composite(c_rgb, g_rgb, g_a)
    bg_rgb, bg_a = over(c_rgb, c_a, s_rgb, s_a)
    save(bg_rgb, bg_a, os.path.join(BOWL, "bg%s.png" % suffix))
    mask = np.clip(m_rgb[:, :, 0], 0.0, 1.0)
    save(bg_rgb, bg_a * mask, os.path.join(BOWL, "decor_front%s.png" % suffix))
    save(g_rgb, g_a, os.path.join(BOWL, "glass%s.png" % suffix))
    return {"opaqueRect": bbox(bg_a, ALPHA_THRESHOLD), "max_shadow_alpha": round(float(s_a.max()), 4),
            "glass_coverage_pct": round(float((g_a > 0.02).mean()) * 100, 2),
            "decor_coverage_pct": round(float((bg_a * mask > 0.5).mean()) * 100, 2)}


def build_memorial():
    b_rgb, b_a = load(os.path.join(STAGE, "bowl", "_mem_shadow.png"))
    c_rgb, c_a = load(os.path.join(STAGE, "bowl", "_mem_clean.png"))
    g_rgb, g_a = load(os.path.join(STAGE, "bowl", "_glass.png"))
    s_rgb, s_a = contact_shadow(b_a, c_a)
    c_rgb = un_composite(c_rgb, g_rgb, g_a)
    m_rgb, m_a = over(c_rgb, c_a, s_rgb, s_a)
    save(m_rgb, m_a, os.path.join(BOWL, "memorial.png"))
    bg_a = load(os.path.join(BOWL, "bg.png"))[1]
    return {"opaqueRect": bbox(m_a, ALPHA_THRESHOLD), "matches_bg": bbox(m_a, ALPHA_THRESHOLD) == bbox(bg_a, ALPHA_THRESHOLD)}


def ellipse_alpha(h, w, feather=1.5):
    """The runtime mask baked as alpha for the formats that carry one, feathered over ~1.5 px."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    x0, y0 = REGION[0], REGION[1]
    cx, cy, rx, ry = MASK["cx"] * ART, MASK["cy"] * ART, MASK["rx"] * ART, MASK["ry"] * ART
    d = np.sqrt(((xx + x0 - cx) / rx) ** 2 + ((yy + y0 - cy) / ry) ** 2)
    edge = feather / rx
    return np.clip((1.0 - d) / edge, 0.0, 1.0)


def build_loop(loop_dir, glass_name, out_name):
    """Every loop frame, un-composited against the glass pass and cropped to REGION. Returns the
    folders the encoders read from."""
    g_rgb, g_a = load(os.path.join(STAGE, "bowl", glass_name))
    frames = sorted(glob.glob(os.path.join(STAGE, loop_dir, "*.png")))
    if not frames:
        return None
    x, y, w, h = REGION
    seq_dir = os.path.join(BOWL, out_name)
    tmp_rgba = os.path.join(STAGE, "_" + out_name + "_rgba")
    tmp_rgb = os.path.join(STAGE, "_" + out_name + "_rgb")
    for d in (seq_dir, tmp_rgba, tmp_rgb):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)
    ell = ellipse_alpha(h, w)
    for i, f in enumerate(frames, start=1):
        rgb, a = load(f)
        rgb = un_composite(rgb, g_rgb, g_a)
        crop_rgb = rgb[y:y + h, x:x + w]
        crop_a = a[y:y + h, x:x + w]
        # Sequence and alpha video: the clip baked in, so neither needs the runtime mask (it is
        # still declared; a stencil costs nothing). Opaque video: straight RGB over black.
        save(crop_rgb, crop_a * ell, os.path.join(seq_dir, "%s_%04d.png" % (out_name, i)))
        save(crop_rgb, crop_a * ell, os.path.join(tmp_rgba, "f_%04d.png" % i))
        save(crop_rgb * crop_a[:, :, None], np.ones_like(crop_a), os.path.join(tmp_rgb, "f_%04d.png" % i))
    return {"frames": len(frames), "seq_dir": seq_dir, "rgba": tmp_rgba, "rgb": tmp_rgb}


def encode(loop, out_name):
    """H.264 (opaque, yuv420p, hardware-decodable everywhere) and HEVC with alpha (VideoToolbox)."""
    mp4 = os.path.join(BOWL, out_name + ".mp4")
    mov = os.path.join(BOWL, out_name + ".mov")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-framerate", str(FPS),
                    "-i", os.path.join(loop["rgb"], "f_%04d.png"),
                    "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p",
                    "-profile:v", "high", "-movflags", "+faststart", "-g", "24", mp4], check=True)
    try:
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-framerate", str(FPS),
                        "-i", os.path.join(loop["rgba"], "f_%04d.png"),
                        "-c:v", "hevc_videotoolbox", "-alpha_quality", "0.9", "-q:v", "75",
                        "-pix_fmt", "bgra", "-tag:v", "hvc1", "-movflags", "+faststart", mov], check=True)
    except subprocess.CalledProcessError as exc:
        print("hevc alpha encode failed:", exc, file=sys.stderr)
        mov = None
    return {"mp4": mp4, "mp4_bytes": os.path.getsize(mp4), "mov": mov, "mov_bytes": os.path.getsize(mov) if mov else None}


def centroid(path):
    _, a = load(path)
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    sa = a.sum()
    return float((xx * a).sum() / sa), float((yy * a).sum() / sa)


def copy_fish():
    out = {}
    cents = {}
    for name, count in STATES:
        src = sorted(glob.glob(os.path.join(STAGE, "fish", name, "*.png")))
        assert len(src) == count, "%s: expected %d frames, found %d" % (name, count, len(src))
        dst_dir = os.path.join(FISH, name)
        shutil.rmtree(dst_dir, ignore_errors=True)
        os.makedirs(dst_dir)
        cs = []
        for i, f in enumerate(src, start=1):
            dst = os.path.join(dst_dir, "%s_%04d.png" % (name, i))
            shutil.copyfile(f, dst)
            cs.append(centroid(dst))
        cents[name] = (sum(c[0] for c in cs) / len(cs), sum(c[1] for c in cs) / len(cs))
        out[name] = {"frames": len(src)}
    base = cents["idle"]
    for name, _ in STATES:
        c = cents[name]
        out[name]["anchor"] = [round((c[0] - base[0]) / ART, 2), round((c[1] - base[1]) / ART, 2)]
    return out


def write_manifest(fish_info, loop_names):
    path = os.path.join(ASSETS, "manifest.json")
    with open(path) as fh:
        m = json.load(fh)
    hab = m["habitats"]["fish/bowl"]
    layers = []
    for l in hab["layers"]:
        if l["name"] == "medium":
            continue
        if l["name"] in ("bg", "decor_front", "glass"):
            l["night"] = {"file": "habitats/fish/bowl/%s_night.png" % l["name"]}
        layers.append(l)
        if l["name"] == "memorial" and LOOP_KIND != "none" and loop_names:
            day, night = loop_names
            medium = {"name": "medium", "z": 0}
            rel = "habitats/fish/bowl/"
            if LOOP_KIND == "frames":
                n = fish_info.get("_loop_frames", 96)
                medium["frames"] = [rel + "%s/%s_%04d.png" % (day, day, i) for i in range(1, n + 1)]
                medium["fps"] = FPS
                medium["night"] = {"frames": [rel + "%s/%s_%04d.png" % (night, night, i) for i in range(1, n + 1)]}
            else:
                ext = ".mov" if LOOP_KIND == "mov" else ".mp4"
                medium["video"] = rel + day + ext
                medium["night"] = {"video": rel + night + ext}
            medium["loop"] = True
            medium["region"] = {"x": REGION[0] // ART, "y": REGION[1] // ART, "w": REGION[2] // ART, "h": REGION[3] // ART}
            medium["mask"] = MASK
            layers.append(medium)
    hab["layers"] = layers
    with open(path, "w") as fh:
        json.dump(m, fh, indent=2)
        fh.write("\n")
    if "idle" not in fish_info:
        return                      # only the loop was rebuilt; the fish block stays as it is
    fish = m["sprites"]["fish"]
    fish["fps"] = FPS
    for name, count in STATES:
        st = fish["states"][name]
        st["source"] = {"kind": "sequence", "files": ["sprites/fish/%s/%s_%04d.png" % (name, name, i) for i in range(1, count + 1)]}
        st["frames"] = count
        st["sequence"] = list(range(count))
        st["anchor"] = fish_info[name]["anchor"]
    with open(path, "w") as fh:
        json.dump(m, fh, indent=2)
        fh.write("\n")
    gpath = os.path.join(FISH, "geometry.json")
    with open(gpath) as fh:
        g = json.load(fh)
    g["fps"] = FPS
    g["frames_perState"] = {name: count for name, count in STATES}
    g["_note_24fps"] = "candidate A: every 12 fps key frame plus the half-frame between (linear interpolation of the rig)"
    with open(gpath, "w") as fh:
        json.dump(g, fh, indent=1)
        fh.write("\n")


if __name__ == "__main__":
    res = {}
    if os.path.exists(os.path.join(STAGE, "bowl", "_bg_shadow.png")):
        res["bowl"] = build_bowl("_", "", "loop")
    if os.path.exists(os.path.join(STAGE, "bowl", "_nbg_shadow.png")):
        res["night"] = build_bowl("_n", "_night", "nloop")
    if os.path.exists(os.path.join(STAGE, "bowl", "_mem_clean.png")):
        res["memorial"] = build_memorial()
    fish_info = {}
    if glob.glob(os.path.join(STAGE, "fish", "*", "*.png")):
        fish_info = copy_fish()
        res["fish"] = fish_info
    loop_names = None
    day = build_loop("loop", "_glass.png", "water_day")
    night = build_loop("nloop", "_nglass.png", "water_night")
    if day and night:
        loop_names = ("water_day", "water_night")
        fish_info["_loop_frames"] = day["frames"]
        res["loop"] = {"frames": day["frames"]}
        if ENCODE:
            res["loop"]["day"] = encode(day, "water_day")
            res["loop"]["night"] = encode(night, "water_night")
        if LOOP_KIND != "frames":
            shutil.rmtree(day["seq_dir"], ignore_errors=True)
            shutil.rmtree(night["seq_dir"], ignore_errors=True)
    if "idle" in fish_info or loop_names:
        write_manifest(fish_info, loop_names)
    print(json.dumps(res, indent=1))
