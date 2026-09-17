"""Generate a placeholder 1024x1024 app icon and a 22/44px tray icon (pixel-art bowl)."""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), '..')

def bowl(size: int) -> Image.Image:
    # Draw on a 16x16 grid then scale with nearest-neighbor for a crisp pixel look.
    g = 16
    im = Image.new('RGBA', (g, g), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((2, 3, 13, 14), fill=(120, 190, 240, 255), outline=(30, 60, 100, 255))
    d.rectangle((5, 2, 10, 3), fill=(30, 60, 100, 255))
    d.rectangle((4, 8, 5, 9), fill=(255, 140, 40, 255))  # fish
    d.rectangle((6, 8, 8, 9), fill=(255, 170, 60, 255))
    d.rectangle((9, 7, 9, 10), fill=(255, 140, 40, 255))
    d.rectangle((3, 11, 12, 13), fill=(60, 110, 180, 255))
    return im.resize((size, size), Image.NEAREST)

os.makedirs(os.path.join(OUT, 'src-tauri', 'icons'), exist_ok=True)
bowl(1024).save(os.path.join(OUT, 'tools', 'app-icon.png'))
bowl(22).save(os.path.join(OUT, 'src-tauri', 'icons', 'tray.png'))
bowl(44).save(os.path.join(OUT, 'src-tauri', 'icons', 'tray@2x.png'))
print('icons written')
