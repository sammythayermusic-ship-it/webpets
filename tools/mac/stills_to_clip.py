#!/usr/bin/env python3
"""Join window stills into a captioned clip.

    python3 tools/mac/stills_to_clip.py <frames-dir> <timeline.tsv> <out.mp4> [fps]

Needs Pillow and ffmpeg (Homebrew's has no drawtext, hence the captions are drawn here).

timeline.tsv lines: <epoch-ms>\t<caption>; a caption holds until the next one. A line whose caption
starts with "@speed <k>" plays the stretch after it k times faster (until the next "@speed").
Stills are composited on a dark backdrop (the window is transparent around the art) with a caption
bar underneath, then laid out at a constant frame rate so the clip runs in real time.
"""
import bisect
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

frames_dir, timeline_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
fps = int(sys.argv[4]) if len(sys.argv) > 4 else 10

frames = sorted(
    (int(f[2:-4]), os.path.join(frames_dir, f)) for f in os.listdir(frames_dir) if f.startswith("f_") and f.endswith(".png")
)
if not frames:
    sys.exit("no frames")

captions, speeds = [], []
with open(timeline_path) as fh:
    for line in fh:
        line = line.rstrip("\n")
        if not line:
            continue
        t, text = line.split("\t", 1)
        if text.startswith("@speed "):
            speeds.append((int(t), float(text.split()[1])))
        else:
            captions.append((int(t), text))
cap_t = [c[0] for c in captions]
spd_t = [s[0] for s in speeds]


def caption_at(t):
    i = bisect.bisect_right(cap_t, t) - 1
    return captions[i][1] if i >= 0 else ""


def speed_at(t):
    i = bisect.bisect_right(spd_t, t) - 1
    return speeds[i][1] if i >= 0 else 1.0


# The first still sets the canvas. The window scales evenly, so a still from a resized window is
# scaled to fit rather than centred: the habitat keeps its size on screen through a resize.
W, H = Image.open(frames[0][1]).size
W += W % 2
BAR = max(56, H // 7)
font = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", max(18, BAR // 3))
BG = (24, 26, 32)

tmp = out_path + ".frames"
shutil.rmtree(tmp, ignore_errors=True)
os.makedirs(tmp)

n = 0
clip_t = 0.0  # seconds of output emitted so far
start = frames[0][0]
for i, (t, path) in enumerate(frames):
    nxt = frames[i + 1][0] if i + 1 < len(frames) else t + 400
    # A long gap between stills is time that was not recorded (a fast-forward between parts): skip it.
    real = min((nxt - t) / 1000.0, 1.5)
    dur = real / speed_at(t)
    img = Image.open(path).convert("RGBA")
    if img.width > W or img.height > H or (img.width < W - 2 and img.height < H - 2):
        k = min(W / img.width, H / img.height)
        img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    canvas = Image.new("RGBA", (W, H + BAR), BG + (255,))
    canvas.alpha_composite(img, ((W - img.width) // 2, (H - img.height) // 2))
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, H, W, H + BAR], fill=(12, 13, 16, 255))
    text = caption_at(t)
    f = font
    while d.textlength(text, font=f) > W - 24 and f.size > 10:
        f = f.font_variant(size=f.size - 1)
    tw = d.textlength(text, font=f)
    d.text(((W - tw) / 2, H + (BAR - f.size) / 2 - 2), text, font=f, fill=(235, 236, 240, 255))
    rgb = canvas.convert("RGB")
    clip_t += dur
    while n < round(clip_t * fps):
        rgb.save(os.path.join(tmp, f"{n:06d}.png"))
        n += 1

H2 = H + BAR
H2 += H2 % 2
subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", os.path.join(tmp, "%06d.png"),
     "-vf", f"pad={W}:{H2}", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", out_path],
    check=True,
)
shutil.rmtree(tmp)
print(out_path, n, "frames", round(n / fps, 1), "s")
