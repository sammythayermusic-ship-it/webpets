#!/bin/bash
# The desktop-level spike (2026-11-03): put the installed harness app's window on the desktop
# (`layering {onDesktop:true}`) and find out what macOS does with it. Writes a log and screenshots
# into <out-dir>; the full-screen captures are evidence for the report, never for the repo.
#
#   WP_BIN=<dir with winlist, clickat, mousepos> tools/mac/spike_desktop.sh <out-dir>
#
# It moves the real cursor, clicks, and may step through Spaces, so it only runs while the Mac has
# been idle for a while, and puts the cursor, the front app and the window level back when it ends.
# Questions it answers:
#   1. Does the level apply, and is the window still on screen (read back, winlist, a capture)?
#   2. Is it on every Space still (step to the next Space and look)?
#   3. Does a click on the tank reach the pet (a knock in the transcript)?
#   4. Does "click the wallpaper to show the desktop" fire on the tank, or on bare desktop next to it?
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BIN=${WP_BIN:-/tmp/webpets-bin}
for t in winlist clickat mousepos; do
  [ -x "$BIN/$t" ] || { echo "missing $BIN/$t (swiftc -O tools/mac/$t.swift -o $BIN/$t)"; exit 2; }
done
HAD="$HOME/Library/Application Support/com.sammythayer.webpets.harness"
RUN=${1:?usage: spike_desktop.sh <out-dir>}
mkdir -p "$RUN"
LOG="$RUN/log.txt"
: > "$LOG"
say() { echo "$*" | tee -a "$LOG"; }

H() {
  local args=${2:-"{}"}
  node "$REPO/tools/harness.mjs" "$1" "$args" --app-data "$HAD" 2>&1 | tee -a "$LOG"
}
idle() { ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}'; }
IDLE0=$(idle)
say "idle at start: ${IDLE0}s"
[ "$IDLE0" -lt 100 ] && { say "not idle; stopping"; exit 3; }

read MX MY < <("$BIN/mousepos")
FRONT=$(osascript -e 'tell application "System Events" to get bundle identifier of first process whose frontmost is true' 2>/dev/null)
# Net Spaces moved to the right, undone at the end.
NET=0
MAIN_WAS_RUNNING=0
restore() {
  H layering '{"onDesktop":false}' >/dev/null
  osascript -e 'tell application "Finder" to close (every window whose name is "Downloads")' >/dev/null 2>&1
  while [ "$NET" -gt 0 ]; do space 123; NET=$((NET - 1)); done
  while [ "$NET" -lt 0 ]; do space 124; NET=$((NET + 1)); done
  "$BIN/clickat" "$MX" "$MY" move 50 >/dev/null 2>&1
  [ "$MAIN_WAS_RUNNING" -eq 1 ] && open -g /Applications/WebPets.app
  [ -n "$FRONT" ] && open -b "$FRONT"
  say "idle at end: $(idle)s"
}
trap restore EXIT

findwin() { # owner (exact); the habitat window is the one not at the ordinary level (25, or the desktop)
  "$BIN/winlist" "$1" | python3 -c '
import json, sys
want = sys.argv[1]
for line in sys.stdin:
    w = json.loads(line)
    if w.get("onscreen") and w["w"] > 100 and w.get("owner") == want and w["layer"] != 0:
        print(w["id"], int(w["x"]), int(w["y"]), int(w["w"]), int(w["h"]), w["layer"]); break
' "$1"
}
space() {
  osascript -e "tell application \"System Events\" to key code $1 using control down"
  [ "$1" = 124 ] && NET=$((NET + 1)) || NET=$((NET - 1))
  sleep 1.5
}
# Windows of other apps that are on screen and ordinary (layer 0), as "x y w h owner" lines.
others() {
  "$BIN/winlist" | python3 -c '
import json, sys
for line in sys.stdin:
    w = json.loads(line)
    if w.get("onscreen") and w["layer"] == 0 and w["w"] > 50 and w["h"] > 50 and w["owner"] not in ("WebPets Harness", "Dock", "Window Server", "WindowManager", "Control Center", "Notification Center"):
        print(int(w["x"]), int(w["y"]), int(w["w"]), int(w["h"]), w["owner"])
'
}
covered() { # x y -> owner of an ordinary window over that point, or nothing
  others | awk -v x="$1" -v y="$2" '$1<=x && x<$1+$3 && $2<=y && y<$2+$4 {print $5; exit}'
}
fish_at() { # window-local CSS px of the fish, as "x y"
  H state | python3 -c "
import json,sys
d = json.load(sys.stdin)['data']
f = d['settings']['scale'] / 8
p = d['scene']['drawnPos']
print(int(24 + p['x'] * f), int(24 + p['y'] * f))
"; }

# The release app's bowl floats above everything and would take the clicks meant for the tank.
if pgrep -f "^/Applications/WebPets.app/Contents/MacOS/webpets" >/dev/null; then
  MAIN_WAS_RUNNING=1
  pkill -f "^/Applications/WebPets.app/Contents/MacOS/webpets"; sleep 1
  say "quit the release app for the test; it comes back at the end"
fi
WIN=$(findwin "WebPets Harness")
if [ -z "$WIN" ]; then
  for k in 123 123 123 124 124 124 124 124 124; do
    space "$k"; WIN=$(findwin "WebPets Harness"); [ -n "$WIN" ] && break
  done
fi
[ -z "$WIN" ] && { say "harness window not found on any Space"; exit 2; }
read WID WX WY WW WH WL <<< "$WIN"
say "window $WID at $WX,$WY ${WW}x${WH} layer $WL (floating)"
H night '{"value":false}' >/dev/null
H scale '{"steps":16}' >/dev/null
sleep 1
WIN=$(findwin "WebPets Harness"); read WID WX WY WW WH WL <<< "$WIN"

# 1. On the desktop.
say "== 1. level"
H layering '{"onDesktop":true}' | grep -E '"level"|"ok"' | tr -d ' ' | paste -sd' ' - | tee -a "$LOG"
sleep 1.5
WIN=$(findwin "WebPets Harness")
say "winlist after: ${WIN:-NOT ON SCREEN}"
[ -n "$WIN" ] && read WID WX WY WW WH WL <<< "$WIN"
screencapture -x "$RUN/desktop-1-on.png"
screencapture -x -o -l"$WID" "$RUN/window-1-on.png"
say "others on screen now:"; others | tee -a "$LOG"

# 2. Other Spaces: one step each way. A full-screen app's Space never shows the pet (by design);
# a desktop Space should.
say "== 2. the Spaces either side"
for k in 124 123; do
  space "$k"
  fs=$("$BIN/winlist" Dock | grep -c "Fullscreen Backdrop")
  WIN2=$(findwin "WebPets Harness")
  say "one step $([ "$k" = 124 ] && echo right || echo left): $([ "$fs" -gt 0 ] && echo 'a full-screen Space' || echo 'a desktop Space'); tank ${WIN2:-NOT ON SCREEN}"
  screencapture -x "$RUN/desktop-2-space-$k.png"
  space "$([ "$k" = 124 ] && echo 123 || echo 124)"
done
read FX FY < <(fish_at)
SX=$((WX + FX)); SY=$((WY + FY))
say "fish at screen $SX,$SY covered by: $(covered "$SX" "$SY")"

# 3. Clicks on the tank: a knock on the glass (a 'tap' line), then a click on the fish (opens the chat).
say "== 3. clicks on the tank"
before=$(H transcript | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']['lines']))")
others > "$RUN/others-before-tank-click.txt"
GX=$((WX + WW / 2)); GY=$((WY + 70))
"$BIN/clickat" "$GX" "$GY" move 300 >/dev/null; sleep 2
"$BIN/clickat" "$GX" "$GY" click 200 >/dev/null
sleep 3
after=$(H transcript | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['lines']; print(len(d), [(l['kind'], l['text']) for l in d[-2:]])")
say "knock on the glass at $GX,$GY: transcript before $before lines; after: $after"
screencapture -x -o -l"$WID" "$RUN/window-3-knock.png"
"$BIN/clickat" "$SX" "$SY" move 300 >/dev/null; sleep 0.5
"$BIN/clickat" "$SX" "$SY" click 200 >/dev/null
sleep 1.5
say "click on the fish: $(H state | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print('hasFocus', d['hasFocus'])")"
screencapture -x -o -l"$WID" "$RUN/window-3-fish-click.png"
osascript -e 'tell application "System Events" to key code 53' >/dev/null 2>&1; sleep 1
others > "$RUN/others-after-tank-click.txt"
if ! diff -q "$RUN/others-before-tank-click.txt" "$RUN/others-after-tank-click.txt" >/dev/null; then
  say "other windows CHANGED after the tank click (show desktop fired?)"; diff "$RUN/others-before-tank-click.txt" "$RUN/others-after-tank-click.txt" | tee -a "$LOG"
else
  say "other windows unchanged after the tank click"
fi
screencapture -x "$RUN/desktop-3-after-tank-click.png"

# 4. A click on bare desktop beside the tank, with an ordinary window open so "click the wallpaper
# to show the desktop" has something to hide. The Finder window is closed again at the end.
say "== 4. a click on bare desktop beside the tank"
open "$HOME/Downloads"; sleep 2
BX=$((WX - 60)); BY=$((WY + WH / 2))
[ "$BX" -lt 10 ] && BX=$((WX + WW + 60))
say "bare point $BX,$BY covered by: $(covered "$BX" "$BY")"
others > "$RUN/others-before-bare-click.txt"
"$BIN/clickat" "$BX" "$BY" move 300 >/dev/null; sleep 0.5
"$BIN/clickat" "$BX" "$BY" click 200 >/dev/null
sleep 2
others > "$RUN/others-after-bare-click.txt"
if ! diff -q "$RUN/others-before-bare-click.txt" "$RUN/others-after-bare-click.txt" >/dev/null; then
  say "other windows CHANGED after the bare click (show desktop fired)"; diff "$RUN/others-before-bare-click.txt" "$RUN/others-after-bare-click.txt" | tee -a "$LOG"
  screencapture -x "$RUN/desktop-4-after-bare-click.png"
  # Click again to bring them back.
  "$BIN/clickat" "$BX" "$BY" click 200 >/dev/null; sleep 1.5
else
  say "other windows unchanged after the bare click"
  screencapture -x "$RUN/desktop-4-after-bare-click.png"
fi
WIN3=$(findwin "WebPets Harness")
say "tank at the end: ${WIN3:-NOT ON SCREEN}"
say "done"
