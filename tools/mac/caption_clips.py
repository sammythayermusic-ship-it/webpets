#!/usr/bin/env python3
"""Caption the harness's canvas recordings and join them per habitat.

    python3 tools/mac/caption_clips.py <rec-dir> <out-dir>

<rec-dir>/captions.tsv lines: <file>\t<caption>. Clips are grouped by the part of their name before
the first dash (bowl-7, bowl-12, ... -> clip-bowl.mp4). Each frame is composited on a dark backdrop
(the window is transparent around the habitat) with a caption bar under it; Homebrew's ffmpeg has no
drawtext, so the captions are drawn with Pillow, as stills_to_clip.py does.
"""
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

rec, out = sys.argv[1], sys.argv[2]
FPS = 30
os.makedirs(out, exist_ok=True)
rows = [l.rstrip("\n").split("\t", 1) for l in open(os.path.join(rec, "captions.tsv")) if l.strip()]
groups = {}
for f, cap in rows:
    groups.setdefault(f.split("-", 1)[0], []).append((f, cap))

for group, items in groups.items():
    tmp = tempfile.mkdtemp(prefix=f"cap-{group}-")
    n = 0
    size = None
    for f, cap in items:
        fr = os.path.join(tmp, "raw")
        shutil.rmtree(fr, ignore_errors=True)
        os.makedirs(fr)
        subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(rec, f), "-vf", f"fps={FPS}", os.path.join(fr, "f_%05d.png")], check=True)
        for name in sorted(os.listdir(fr)):
            im = Image.open(os.path.join(fr, name)).convert("RGBA")
            if size is None:
                W, H = im.size
                W += W % 2
                BAR = max(56, H // 9)
                H2 = H + BAR + (H + BAR) % 2
                size = (W, H2, BAR)
                font = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", max(18, BAR // 3))
            W, H2, BAR = size
            canvas = Image.new("RGBA", (W, H2), (30, 30, 36, 255))
            canvas.alpha_composite(im.resize((W, H2 - BAR)) if im.size != (W, H2 - BAR) else im)
            d = ImageDraw.Draw(canvas)
            d.rectangle([0, H2 - BAR, W, H2], fill=(18, 18, 22, 255))
            tw = d.textlength(cap, font=font)
            d.text(((W - tw) / 2, H2 - BAR + (BAR - font.size) / 2 - 2), cap, font=font, fill=(235, 235, 240, 255))
            canvas.convert("RGB").save(os.path.join(tmp, "c_%06d.png" % n))
            n += 1
    dst = os.path.join(out, f"clip-{group}.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", os.path.join(tmp, "c_%06d.png"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-preset", "slow", "-movflags", "+faststart", dst], check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    print(dst, n, "frames", round(n / FPS, 1), "s", flush=True)
