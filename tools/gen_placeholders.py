"""Generate labelled PLACEHOLDER art for a habitat that has no rendered art yet.

CLAUDE.md: "When art is missing, generate labeled placeholder PNGs at the correct size and keep going.
Do not ask for art." The previous generator did exactly that and was then deleted along with the pixel
art it produced (commit f78fb06), which left the rule with no implementation behind it. This is a fresh
one, deliberately small and deliberately general: nothing about a hamster is hardcoded except the
drawing of the hamster.

Two things make this worth having rather than hand-drawing a grey box:

1. **It emits the manifest fragment as well as the PNGs.** Sprite anchors must equal the measured alpha
   centroid of each state to about 0.05 px or `habitatArt.test.ts` fails. Writing anchors by hand
   against art you also wrote by hand is a guessing game with 16 chances to be wrong; measuring them
   from the pixels that were just drawn cannot drift.

2. **It satisfies the real gates, rather than being exempted from them.** The output has a soft contact
   shadow (so the alpha-0.5 bbox genuinely differs from the alpha-0.01 one), animates (so consecutive
   frames differ by more than 2% of opaque pixels), and its background's alpha-0.5 bounding box is
   forced to equal `opaqueRect` exactly, because that rect is the click-through contract and a
   placeholder that got it wrong would make the window eat clicks over empty desk.

Usage:
    python3 tools/gen_placeholders.py hamster cage

Writes assets/habitats/<species>/<habitat>/*.png, assets/sprites/<species>/<state>/*.png, and prints a
JSON fragment to merge into assets/manifest.json.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

# The art is rendered at this whole multiple of the logical grid. 4x matches the shipped fish, and
# `habitatArt.test.ts` requires every file-backed layer of one habitat to share a single multiple.
SCALE = 4

# A 3x5 bitmap font, enough for the stamp. Kept here rather than loading a system font so the output is
# byte-identical on any machine -- a placeholder that changes when the font stack changes would make
# every art test machine-dependent.
FONT = {
    "A": ("010", "101", "111", "101", "101"), "C": ("011", "100", "100", "100", "011"),
    "D": ("110", "101", "101", "101", "110"), "E": ("111", "100", "110", "100", "111"),
    "H": ("101", "101", "111", "101", "101"), "L": ("100", "100", "100", "100", "111"),
    "O": ("111", "101", "101", "101", "111"), "P": ("111", "101", "111", "100", "100"),
    "R": ("111", "101", "110", "101", "101"), "S": ("011", "100", "010", "001", "110"),
    "T": ("111", "010", "010", "010", "010"), "M": ("101", "111", "111", "101", "101"),
    "B": ("110", "101", "110", "101", "110"), "G": ("011", "100", "101", "101", "011"),
    "N": ("101", "111", "111", "111", "101"), "I": ("111", "010", "010", "010", "111"),
    "W": ("101", "101", "111", "111", "101"), "K": ("101", "101", "110", "101", "101"),
    "F": ("111", "100", "110", "100", "100"), "U": ("101", "101", "101", "101", "111"),
    "Y": ("101", "101", "010", "010", "010"), "1": ("010", "110", "010", "010", "111"),
    " ": ("000", "000", "000", "000", "000"),
}


def stamp(d: ImageDraw.ImageDraw, text: str, x: int, y: int, px: int, fill: tuple) -> None:
    """Draw `text` in the 3x5 font with each font pixel `px` wide."""
    cx = x
    for ch in text.upper():
        rows = FONT.get(ch)
        if rows is None:
            cx += 4 * px
            continue
        for ry, row in enumerate(rows):
            for rxi, on in enumerate(row):
                if on == "1":
                    d.rectangle([cx + rxi * px, y + ry * px, cx + (rxi + 1) * px - 1, y + (ry + 1) * px - 1], fill=fill)
        cx += 4 * px
    return None


def alpha_bbox(im: Image.Image, thresh: int) -> tuple[int, int, int, int]:
    """Bounding box of pixels with alpha strictly above `thresh` (0..255), as (x0, y0, x1, y1) inclusive."""
    a = im.getchannel("A")
    mask = a.point(lambda v: 255 if v > thresh else 0)
    bb = mask.getbbox()
    if bb is None:
        raise SystemExit("image is fully transparent")
    return (bb[0], bb[1], bb[2] - 1, bb[3] - 1)


def centroid(im: Image.Image) -> tuple[float, float]:
    """Alpha-weighted centroid in pixels. This is what a sprite `anchor` has to match."""
    a = im.getchannel("A")
    w, h = a.size
    px = a.load()
    sx = sy = sw = 0.0
    for y in range(h):
        for x in range(w):
            v = px[x, y]
            if v:
                sx += x * v
                sy += y * v
                sw += v
    if sw == 0:
        raise SystemExit("frame is fully transparent")
    return (sx / sw, sy / sw)


def cage_bg(grid: tuple[int, int], opaque: dict, sites: dict, stand_y: int, memorial: bool) -> Image.Image:
    """The cage itself. Its alpha-0.5 bbox is forced to equal `opaqueRect` exactly."""
    W, H = grid[0] * SCALE, grid[1] * SCALE
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    x0, y0 = opaque["x"] * SCALE, opaque["y"] * SCALE
    x1, y1 = (opaque["x"] + opaque["w"]) * SCALE - 1, (opaque["y"] + opaque["h"]) * SCALE - 1

    # The soft contact shadow goes on FIRST and on its own layer, so it stays below the alpha-0.5
    # threshold everywhere and cannot widen the opaque bbox. It is what makes the 0.5 and 0.01 bboxes
    # genuinely differ, which is a gate the shipped art passes because a 3D render really does have one.
    sy = stand_y * SCALE  # the bedding line, used by the tray below as well as the shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    # Under the cage's BOTTOM edge, not under the bedding line. A contact shadow that sits inside the
    # object casts onto nothing: the soft alpha box has to reach BELOW the hard one or the habitat
    # reads as a sticker, which is the gate `habitatArt.test.ts` applies to every species.
    sd.ellipse([x0 - 24, y1 - 8, x1 + 24, y1 + 74], fill=(20, 16, 24, 80))
    # The shadow has to live in a narrow band: dark enough to clear the 0.01 threshold (so it counts as
    # a shadow at all) and light enough to stay under 0.5 (so it never enters the opaque box that
    # decides click-through). Both ends were hit while tuning this -- at radius 26 it faded to alpha 1
    # and read as no shadow; at fill 170 it reached 169 and dragged the click-through region 16 logical
    # px below the cage, which would have made the window swallow clicks over bare desk.
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    im.alpha_composite(shadow)

    body = (108, 112, 124, 255) if not memorial else (96, 96, 102, 255)
    bed = (176, 150, 110, 255) if not memorial else (126, 120, 112, 255)
    bar = (190, 196, 208, 255) if not memorial else (140, 140, 146, 255)

    d = ImageDraw.Draw(im)
    # Bedding, then the tray, then the bars. Drawn to the exact opaque bounds at full alpha so the
    # alpha-0.5 bbox lands on them and nothing softer can push it outward.
    d.rectangle([x0, sy - 6 * SCALE, x1, y1], fill=bed)
    d.rectangle([x0, y1 - 10 * SCALE, x1, y1], fill=body)
    for bx in range(x0, x1 + 1, 11 * SCALE):
        d.rectangle([bx, y0, min(bx + 2 * SCALE, x1), y1 - 10 * SCALE], fill=bar)
    d.rectangle([x0, y0, x1, y0 + 3 * SCALE], fill=body)
    d.rectangle([x0, y0, x0 + 3 * SCALE, y1], fill=body)
    d.rectangle([x1 - 3 * SCALE, y0, x1, y1], fill=body)

    if not memorial:
        # The furniture, from the same `sites` the behaviour navigates by -- so what is drawn and what
        # the hamster walks to cannot disagree.
        wheel = sites["wheel"]
        wx0, wy0 = wheel["x"] * SCALE, wheel["y"] * SCALE
        wx1, wy1 = (wheel["x"] + wheel["w"]) * SCALE, (wheel["y"] + wheel["h"]) * SCALE
        d.ellipse([wx0, wy0, wx1, wy1], outline=(212, 206, 190, 255), width=3 * SCALE)
        for k in range(8):
            a = k * math.pi / 4
            cxw, cyw = (wx0 + wx1) / 2, (wy0 + wy1) / 2
            r = (wx1 - wx0) / 2 - 2 * SCALE
            d.line([cxw, cyw, cxw + r * math.cos(a), cyw + r * math.sin(a)], fill=(196, 190, 172, 255), width=SCALE)
        hop = sites["hopper"]
        d.rectangle(
            [hop["x"] * SCALE, hop["y"] * SCALE, (hop["x"] + hop["w"]) * SCALE, (hop["y"] + hop["h"]) * SCALE],
            fill=(150, 120, 80, 255), outline=(90, 70, 46, 255), width=SCALE,
        )
        bedr = sites["bed"]
        d.ellipse(
            [bedr["x"] * SCALE, bedr["y"] * SCALE, (bedr["x"] + bedr["w"]) * SCALE, (bedr["y"] + bedr["h"]) * SCALE],
            fill=(206, 184, 142, 255),
        )

    label = "PLACEHOLDER" if not memorial else "PLACEHOLDER MEMORIAL"
    stamp(d, label, x0 + 6 * SCALE, y0 + 6 * SCALE, SCALE, (250, 250, 250, 255))
    return im


def hamster_frame(frame_px: int, state: str, i: int, n: int) -> Image.Image:
    """One sprite frame. Animated on purpose: static frames fail the >2% frame-difference gate.

    The bob uses sine and the squash cosine so that the PAIR is unique per frame. Driving both from
    sine looked fine and was not: at six frames, sin(tau*1/6) and sin(tau*2/6) are the same number, so
    frames 2 and 3 came out byte-identical and three of the five states failed the motion gate while
    the maths looked obviously animated.
    """
    im = Image.new("RGBA", (frame_px, frame_px), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    t = i / max(1, n)
    c = frame_px / 2

    # Sized to sit inside the allowed band: strictly larger than the body box on both axes, and no more
    # than 12 logical px past it on any side.
    bw, bh = 54 * SCALE, 38 * SCALE
    if state == "dead":
        # On its SIDE, which is wider and flatter -- not taller. Swapping the two axes made a vertical
        # oval that read as a hamster standing to attention at its own funeral.
        bw, bh = 60 * SCALE, 34 * SCALE
    elif state == "sleep":
        bh = 33 * SCALE
    elif state == "hungry":
        bh = 35 * SCALE

    bob = math.sin(t * math.tau) * (0.0 if state == "dead" else 2.2) * SCALE
    squash = 1.0 + math.cos(t * math.tau) * (0.0 if state == "dead" else 0.06)

    hw, hh = bw / 2, (bh / 2) * squash
    fill = {"dead": (150, 132, 116, 255), "hungry": (196, 164, 126, 255)}.get(state, (214, 178, 132, 255))
    d.ellipse([c - hw, c - hh + bob, c + hw, c + hh + bob], fill=fill)

    # Ear, and an eye except where the animal's eyes are shut. Both move with the body so the frames
    # differ somewhere other than the silhouette.
    d.ellipse([c + hw * 0.35, c - hh * 0.95 + bob, c + hw * 0.72, c - hh * 0.35 + bob], fill=(232, 200, 160, 255))
    if state not in ("dead", "sleep"):
        d.ellipse([c + hw * 0.52, c - hh * 0.2 + bob, c + hw * 0.66, c - hh * 0.04 + bob], fill=(40, 30, 26, 255))
    if state == "eat":
        # A cheek pouch that fills across the state, so `eat` is distinguishable from `idle` at a glance
        # rather than only by its frame count.
        r = (2 + 4 * t) * SCALE
        d.ellipse([c + hw * 0.62 - r, c + bob - r, c + hw * 0.62 + r, c + bob + r], fill=(226, 192, 150, 255))

    # The stamp sits ON the body rather than below it. Below, it dragged the alpha bbox down and ate
    # most of the 3 px centring tolerance for no benefit.
    stamp(d, "PH", int(c - hw * 0.55), int(c + bob - 2 * SCALE), max(1, SCALE // 2), (92, 70, 54, 220))
    return im


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: gen_placeholders.py <species> <habitat>")
    species, habitat = sys.argv[1], sys.argv[2]
    if species != "hamster":
        raise SystemExit(f"no placeholder drawing for species {species!r} (only 'hamster' so far)")

    # Geometry, mirroring `src/species/hamster/layout.ts`.
    #
    # Duplicated deliberately, and NOT parsed out of the TypeScript: a regex over source is a parser
    # that fails silently when someone reformats a line, and it had already broken twice on this file
    # before it produced a single PNG. The repo's existing answer to exactly this problem is the fish's
    # `layout.test.ts` -- keep two copies and assert they match -- so `hamster/layout.test.ts` compares
    # these numbers against the manifest this script emits. Change one and the suite says so.
    stand_y = 185
    opaque = {"x": 40, "y": 40, "w": 240, "h": 170}
    pantry = {"x": 70, "y": 152, "w": 28, "h": 34}
    sites = {
        "wheel": {"x": 180, "y": 128, "w": 64, "h": 64},
        "hopper": {"x": 68, "y": 150, "w": 32, "h": 38},
        "bed": {"x": 116, "y": 172, "w": 48, "h": 20},
    }
    pet_anchor = [140, stand_y]
    body = {"w": 44, "h": 30}
    floor = {"x": 58, "w": 204}

    grid = (320, 240)
    hab_dir = ASSETS / "habitats" / species / habitat
    hab_dir.mkdir(parents=True, exist_ok=True)

    bg = cage_bg(grid, opaque, sites, stand_y, memorial=False)
    mem = cage_bg(grid, opaque, sites, stand_y, memorial=True)

    # Checked BEFORE anything is written. These same two properties failed twice while tuning the
    # shadow, and each time the bad PNG was already on disk when the check fired -- so the next run of
    # the test suite was measuring art the generator had itself rejected.
    got = alpha_bbox(bg, 127)
    want = (opaque["x"] * SCALE, opaque["y"] * SCALE,
            (opaque["x"] + opaque["w"]) * SCALE - 1, (opaque["y"] + opaque["h"]) * SCALE - 1)
    if got != want:
        raise SystemExit(f"bg alpha>0.5 bbox {got} != opaqueRect {want}; click-through would be wrong")
    soft = alpha_bbox(bg, 2)
    if soft[3] <= got[3]:
        raise SystemExit("bg has no soft contact shadow: nothing below 0.5 alpha extends past the object")

    bg.save(hab_dir / "bg.png")
    mem.save(hab_dir / "memorial.png")

    # States, frame counts and loop flags mirror the fish's, minus the three mood expressions, which are
    # a lookdev nicety rather than something a placeholder can meaningfully convey.
    # `dead` is ONE frame, and that is the honest answer rather than a way around the motion gate: a
    # dead hamster on bedding does not move. The gate skips single-frame states precisely so a still
    # thing can be still — the shipped fish's `dead` has six frames only because a corpse floating on
    # water genuinely drifts. Giving this one a bob to clear a threshold would have been inventing
    # motion to satisfy a test, which is the exact failure the test exists to prevent.
    states = {"idle": (8, True, None), "eat": (6, False, "idle"), "hungry": (6, True, None),
              "sleep": (6, True, None), "dead": (1, True, None)}
    frame_px = 80 * SCALE
    sprite_states: dict = {}
    for state, (n, loop, return_to) in states.items():
        sdir = ASSETS / "sprites" / species / state
        sdir.mkdir(parents=True, exist_ok=True)
        files, cents = [], []
        for i in range(n):
            im = hamster_frame(frame_px, state, i, n)
            rel = f"sprites/{species}/{state}/{state}_{i + 1:04d}.png"
            im.save(ASSETS / rel)
            files.append(rel)
            cents.append(centroid(im))
        # The anchor is the MEASURED offset of this state's centroid from the frame centre, in logical
        # px -- averaged across the state's frames, which is what the art test compares against.
        cx = sum(c[0] for c in cents) / len(cents)
        cy = sum(c[1] for c in cents) / len(cents)
        anchor = [round((cx - frame_px / 2) / SCALE, 2), round((cy - frame_px / 2) / SCALE, 2)]
        entry: dict = {"source": {"kind": "sequence", "files": files}, "frames": n,
                       "sequence": list(range(n)), "loop": loop, "anchor": anchor}
        if return_to:
            entry["returnTo"] = return_to
        sprite_states[state] = entry

    fragment = {
        "habitats": {
            f"{species}/{habitat}": {
                "grid": [grid[0], grid[1]],
                "layers": [
                    {"name": "bg", "file": f"habitats/{species}/{habitat}/bg.png", "z": 0},
                    {"name": "memorial", "file": f"habitats/{species}/{habitat}/memorial.png", "z": 0},
                    {"name": "pet", "z": 0},
                    {"name": "food", "z": 0},
                    {"name": "fx", "z": 0},
                ],
                # `water`/`waterShape` are still required by the manifest schema. A cage fills them
                # with its walkable span flattened to one row -- a degenerate ellipse -- because the
                # movement domain the behaviour actually uses comes from the species module, not from
                # here. Stage 4 replaces both with a proper `domain` union; until then this is the
                # honest degenerate case rather than an invented body of water.
                "water": {"x": floor["x"], "y": stand_y, "w": floor["w"], "h": 1},
                "waterShape": {"cx": floor["x"] + floor["w"] // 2, "cy": stand_y,
                               "rx": floor["w"] // 2, "ry": 1,
                               "surfaceY": stand_y, "floorY": stand_y},
                "petAnchor": pet_anchor,
                "opaqueRect": opaque,
                "pantryRect": pantry,
            }
        },
        "sprites": {species: {"frame": [80, 80], "fps": 12, "body": body, "states": sprite_states}},
    }
    print(json.dumps(fragment, indent=2))


if __name__ == "__main__":
    main()
