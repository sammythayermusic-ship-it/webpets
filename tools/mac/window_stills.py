#!/usr/bin/env python3
"""Window-capture stills of one window id until a stop file appears.

    python3 tools/mac/window_stills.py <window-id> <out-dir> <stop-file> [interval-s]

Speech bubbles and the HUD are DOM, so the harness's canvas recorder cannot see them; stills of the
window can. Find the id with winlist.swift; the window must be on the current Space.

Each still is <out-dir>/f_<epoch-ms>.png, from `screencapture -x -o -l<id>` (the window only, no shadow).
"""
import os
import subprocess
import sys
import time

wid, out, stop = sys.argv[1], sys.argv[2], sys.argv[3]
interval = float(sys.argv[4]) if len(sys.argv) > 4 else 0.4
os.makedirs(out, exist_ok=True)
while not os.path.exists(stop):
    t0 = time.time()
    path = os.path.join(out, f"f_{int(t0 * 1000)}.png")
    subprocess.run(["screencapture", "-x", "-o", f"-l{wid}", path], check=False)
    dt = time.time() - t0
    if dt < interval:
        time.sleep(interval - dt)
