"""Step 4: install h_anim.py's hamster frames and write their manifest entries.

    python3 assets/3d/scripts/h_anim_finish.py <stage_dir>

Registration. The hamster's existing states are registered by their alpha centroid against idle's,
the rule src/render/habitatArt.test.ts holds the fish to. A TRANSITION cannot use one anchor: it
starts in one state's registration and ends in another's, and a single number would make the body
jump at one end or the other. So a transition carries its start state's anchor plus per-frame
`offsets` that walk to its end state's anchor along the same progress curve its pose follows. The
three new poses the hamster holds (dig, drink, run) are registered to idle, so its feet stay where
they were: the rig never leaves the spot, and the art carries the motion.
"""
import json
import math
import os
import shutil
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
STAGE = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/webpets/stage-anim/r96")
MAN = os.path.join(REPO, "assets", "manifest.json")


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# progress from the start state's registration to the end state's, per frame (h_anim.py's curves)
def prog_liedown(i, n):
    return smooth(((i / (n - 1)) - 0.3) / 0.7)


def prog_wake(i, n):
    return smooth((i / (n - 1)) / 0.6)


def prog_die(i, n):
    t = i / (n - 1)
    return 0.0 if t < 0.3 else min(1.0, ((t - 0.3) / 0.7) ** 2)


# name: (frames, loop, returnTo, from-state for registration, to-state, progress)
NEW = {
    "turn": (7, False, None, "idle", "idle", None),
    "liedown": (8, False, "sleep", "idle", "sleep", prog_liedown),
    "wake": (6, False, "idle", "sleep", "idle", prog_wake),
    "die": (8, False, "dead", "idle", "dead", prog_die),
    "startle": (5, False, "idle", "idle", "idle", None),
    "dig": (6, True, None, "idle", "idle", None),
    "drink": (6, True, None, "idle", "idle", None),
    "run": (8, True, None, "idle", "idle", None),
}


def main():
    man = json.load(open(MAN))
    ham = man["sprites"]["hamster"]
    states = ham["states"]
    for name in list(NEW) + ["eat"]:
        src = os.path.join(STAGE, name)
        dst = os.path.join(REPO, "assets", "sprites", "hamster", name)
        shutil.rmtree(dst, ignore_errors=True)
        os.makedirs(dst)
        for f in sorted(os.listdir(src)):
            shutil.copyfile(os.path.join(src, f), os.path.join(dst, f))
    for name, (n, loop, ret, a_from, a_to, prog) in NEW.items():
        files = [f"sprites/hamster/{name}/{name}_{i + 1:04d}.png" for i in range(n)]
        af = states[a_from].get("anchor", [0.0, 0.0])
        at = states[a_to].get("anchor", [0.0, 0.0])
        st = {"source": {"kind": "sequence", "files": files}, "frames": n, "sequence": list(range(n)),
              "loop": loop, "anchor": [round(af[0], 2), round(af[1], 2)]}
        if ret:
            st["returnTo"] = ret
        if prog is not None:
            # offset = how far the registration has moved from the start anchor toward the end one.
            # The player draws at -anchor + offset, so walking to the end anchor is -(to - from) * p.
            st["offsets"] = [[round(-(at[0] - af[0]) * prog(i, n), 3), round(-(at[1] - af[1]) * prog(i, n), 3)] for i in range(n)]
        states[name] = st
    # the eat frames were replaced in place (same count, same registration); the transitions in
    states["sleep"]["enterVia"] = "liedown"
    states["sleep"]["exitVia"] = "wake"
    states["dead"]["enterVia"] = "die"
    with open(MAN, "w") as fh:
        json.dump(man, fh, indent=2)
        fh.write("\n")
    print("states:", sorted(states))


if __name__ == "__main__":
    main()
