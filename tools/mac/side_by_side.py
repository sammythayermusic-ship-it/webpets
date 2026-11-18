#!/usr/bin/env python3
"""Lay a "before" take and an "after" take side by side, step by step, with captions.

    python3 tools/mac/side_by_side.py <rec-dir> <out-dir>

<rec-dir> holds record_animation_browser.mjs's clips, <tag>-<pet>-<step>.webm for tags before and
after. Writes <out-dir>/clip-<pet>.mp4: each step is before | after at half size, labelled, with the
step's caption under it. Homebrew's ffmpeg has no drawtext, so the text is drawn with Pillow.
"""
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

rec, out = sys.argv[1], sys.argv[2]
FPS = 30
STEPS = {
    "hamster": [
        ("wander", "Pottering about: a turn is a real turn now, and it gives a little when it stops"),
        ("tap", "A tap on the glass: it flinches on the spot, then runs"),
        ("eat", "Food: it fetches it, and its cheek pouches fill as it chews"),
        ("bed", "Bedtime: it walks to its house, digs its bed over and lies down"),
        ("wake", "Morning: it gets up with a stretch, instead of cutting to standing"),
        ("wheel", "The wheel: a running gait, not a standing pose"),
        ("die", "If it dies, it falls onto its side, instead of cutting to the pose"),
    ],
    "fish": [
        ("wander", "Swimming: it brakes with its fins and settles when it stops"),
        ("tap", "A tap on the glass: it bolts with a C-curl and hard tail beats"),
        ("eat", "Food: darting to the flakes and braking at each"),
        ("bed", "Bedtime: it settles to the gravel"),
        ("wake", "Morning"),
    ],
}
os.makedirs(out, exist_ok=True)


def frames(path, dst):
    os.makedirs(dst, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={FPS}", os.path.join(dst, "f_%05d.png")], check=True)
    return [os.path.join(dst, f) for f in sorted(os.listdir(dst))]


for pet, steps in STEPS.items():
    tmp = tempfile.mkdtemp(prefix=f"sbs-{pet}-")
    n = 0
    font = None
    for step, cap in steps:
        b = os.path.join(rec, f"before-{pet}-{step}.webm")
        a = os.path.join(rec, f"after-{pet}-{step}.webm")
        if not (os.path.exists(b) and os.path.exists(a)):
            print("missing", pet, step, flush=True)
            continue
        fb = frames(b, os.path.join(tmp, "b"))
        fa = frames(a, os.path.join(tmp, "a"))
        count = min(len(fb), len(fa))
        for i in range(count):
            ib = Image.open(fb[i]).convert("RGBA")
            ia = Image.open(fa[i]).convert("RGBA")
            w, h = ib.width // 2, ib.height // 2
            head, bar = 44, 58
            if font is None:
                font = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", 22)
                small = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", 18)
            W, H = w * 2 + 8, h + head + bar
            canvas = Image.new("RGBA", (W, H), (30, 30, 36, 255))
            canvas.alpha_composite(ib.resize((w, h), Image.LANCZOS), (0, head))
            canvas.alpha_composite(ia.resize((w, h), Image.LANCZOS), (w + 8, head))
            d = ImageDraw.Draw(canvas)
            d.rectangle([w, 0, w + 7, H], fill=(18, 18, 22, 255))
            for x0, label in ((0, "Before (Step 3)"), (w + 8, "After (Step 4)")):
                tw = d.textlength(label, font=small)
                d.text((x0 + (w - tw) / 2, 12), label, font=small, fill=(200, 200, 210, 255))
            d.rectangle([0, H - bar, W, H], fill=(18, 18, 22, 255))
            tw = d.textlength(cap, font=font)
            d.text(((W - tw) / 2, H - bar + 16), cap, font=font, fill=(240, 240, 245, 255))
            canvas.convert("RGB").save(os.path.join(tmp, "c_%06d.png" % n))
            n += 1
        shutil.rmtree(os.path.join(tmp, "b"))
        shutil.rmtree(os.path.join(tmp, "a"))
    dst = os.path.join(out, f"clip-{pet}.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", os.path.join(tmp, "c_%06d.png"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-preset", "slow", "-movflags", "+faststart", dst], check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    print(dst, n, "frames", round(n / FPS, 1), "s", flush=True)
