#!/usr/bin/env python3
"""A group-chat mockup for a checkpoint report: the shared clip (a frame with a play badge) and the
pet card in a made-up thread, the way they would land in a group chat. Not part of the app.

    python3 tools/mac/groupchat_mockup.py <clip.mp4> <card.png> <out.png>

Needs Pillow and ffmpeg.
"""
import subprocess, sys, tempfile, os
from PIL import Image, ImageDraw, ImageFont

clip, card, out = sys.argv[1:4]
W, H = 1179, 2700
BG = (255, 255, 255)
BLUE = (10, 132, 255)
GREY = (233, 233, 235)
INK = (20, 20, 22)
DIM = (142, 142, 147)

def font(size, bold=False):
    path = '/System/Library/Fonts/SFNS.ttf'
    f = ImageFont.truetype(path, size)
    try:
        f.set_variation_by_name('Semibold' if bold else 'Regular')
    except Exception:
        pass
    return f

img = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(img)

# Header.
d.rectangle([0, 0, W, 250], fill=(248, 248, 250))
d.line([0, 250, W, 250], fill=(220, 220, 224), width=2)
for i, (c, n) in enumerate([((255, 159, 10), 'A'), ((48, 209, 88), 'J'), ((191, 90, 242), 'M')]):
    x = W // 2 - 90 + i * 60
    d.ellipse([x, 70, x + 80, 150], fill=c, outline=(248, 248, 250), width=5)
    d.text((x + 40, 110), n, fill='white', font=font(40, True), anchor='mm')
d.text((W // 2, 195), 'Fish people', fill=INK, font=font(38, True), anchor='mm')
d.text((W // 2, 232), '3 people', fill=DIM, font=font(28), anchor='mm')

y = 290

def label(text):
    global y
    d.text((W // 2, y), text, fill=DIM, font=font(28), anchor='mm')
    y += 50

def bubble(text, mine, who=None):
    global y
    f = font(42)
    maxw = 760
    words, lines, line = text.split(), [], ''
    for w in words:
        t = (line + ' ' + w).strip()
        if d.textlength(t, font=f) > maxw and line:
            lines.append(line); line = w
        else:
            line = t
    lines.append(line)
    tw = max(d.textlength(l, font=f) for l in lines)
    bw, bh = tw + 56, len(lines) * 54 + 34
    if who and not mine:
        d.text((90, y), who, fill=DIM, font=font(26))
        y += 36
    x = W - 40 - bw if mine else 40
    d.rounded_rectangle([x, y, x + bw, y + bh], radius=40, fill=BLUE if mine else GREY)
    for i, l in enumerate(lines):
        d.text((x + 28, y + 17 + i * 54), l, fill='white' if mine else INK, font=f)
    y += bh + 18

def picture(im, mine, play=None, maxw=640):
    global y
    k = maxw / im.width
    im = im.resize((maxw, int(im.height * k)))
    x = W - 40 - maxw if mine else 40
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.width, im.height], radius=40, fill=255)
    img.paste(im, (x, y), mask)
    if play:
        # Translucent badges, drawn on their own layer (the page itself has no alpha).
        cx, cy = x + im.width // 2, y + im.height // 2
        layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
        o = ImageDraw.Draw(layer)
        o.ellipse([cx - 60, cy - 60, cx + 60, cy + 60], fill=(0, 0, 0, 120))
        o.rounded_rectangle([x + 20, y + im.height - 70, x + 130, y + im.height - 22], radius=22, fill=(0, 0, 0, 140))
        img.paste(Image.alpha_composite(img.convert('RGBA'), layer).convert('RGB'))
        d.polygon([(cx - 20, cy - 32), (cx - 20, cy + 32), (cx + 34, cy)], fill='white')
        d.text((x + 75, y + im.height - 46), play, fill='white', font=font(30, True), anchor='mm')
    y += im.height + 18

with tempfile.TemporaryDirectory() as tmp:
    frame = os.path.join(tmp, 'f.png')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', '1.5', '-i', clip, '-frames:v', '1', frame], check=True)
    still = Image.open(frame).convert('RGB')
    dur = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clip], capture_output=True, text=True).stdout.strip()
    secs = round(float(dur or 6))

    label('Today 8:12 PM')
    bubble('ok my desktop fish just lost it over the Celtics', True)
    picture(still, True, play=f'0:{secs:02d}')
    bubble('STOP the little speech bubble', False, 'Alex')
    bubble('wait it knows your team??', False, 'Jordan')
    bubble('it knows everything. meet Pebble', True)
    picture(Image.open(card).convert('RGB'), True, maxw=560)
    bubble('i need one. where do i get one', False, 'Maya')

img = img.crop((0, 0, W, min(H, y + 40)))
img.save(out)
print(out, img.size)
