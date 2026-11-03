#!/bin/bash
# The checkpoint D recording (docs/reports/checkpoint-D.md): drives the installed WebPets Harness.app,
# takes window stills (window_stills.py), writes a caption timeline for stills_to_clip.py.
#   Part 1 (moments/): hello, a meal, a knock, a fact and its source, hungry then fed.
#   Part 2 (hour/):    an hour sped up: at the bowl, away, back.
# It moves the real cursor, clicks the bubble (not the source itself: opening it can switch to the
# browser's full-screen Space mid-recording) and may step through Spaces to find the harness window,
# so run it only while nobody is using the Mac. It puts the cursor and the front app back at the end.
#
#   bash tools/mac/record_talk.sh <out-dir>
#   python3 tools/mac/stills_to_clip.py <out-dir>/hour <out-dir>/timeline.tsv hour.mp4
set -u
REPO=$(cd "$(dirname "$0")/../.." && pwd)
BIN=${WP_BIN:-/tmp/webpets-bin}
mkdir -p "$BIN"
for t in winlist clickat mousepos; do
  [ -x "$BIN/$t" ] || swiftc -O "$REPO/tools/mac/$t.swift" -o "$BIN/$t"
done
HAD="$HOME/Library/Application Support/com.sammythayer.webpets.harness"
RUN=${1:?usage: record_talk.sh <out-dir>}
rm -rf "$RUN"; mkdir -p "$RUN"
TL=$RUN/timeline.tsv; : > "$TL"
LOG=$RUN/log.txt; : > "$LOG"

ms() { python3 -c 'import time; print(int(time.time()*1000))'; }
cap() { printf '%s\t%s\n' "$(ms)" "$1" >> "$TL"; echo "[$(date +%T)] $1" >> "$LOG"; }
H() {
  local args="${2-}"
  [ -z "$args" ] && args='{}'
  node "$REPO/tools/harness.mjs" "$1" "$args" --app-data "$HAD" 2>&1 | tee -a "$LOG"
}
idle() { ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}'; }
rectmid() { python3 -c '
import json, sys
try:
    d = json.load(sys.stdin).get("data", {})
except Exception:
    d = {}
r = d.get("linkRect")
print(int(r["x"] + r["w"] / 2), int(r["y"] + r["h"] / 2)) if r else print("")
'; }

IDLE0=$(idle)
echo "idle at start: ${IDLE0}s" >> "$LOG"
FRONT=$(lsappinfo info -only bundleid "$(lsappinfo front)" | sed -E 's/.*="(.*)"/\1/')
read MX MY < <("$BIN/mousepos")
restore() {
  "$BIN/clickat" "$MX" "$MY" move 50 >/dev/null 2>&1
  [ -n "$FRONT" ] && open -b "$FRONT"
}
trap restore EXIT

# The harness window: id and screen bounds, on the current Space.
findwin() {
  "$BIN/winlist" "WebPets Harness" | python3 -c '
import json, sys
for line in sys.stdin:
    w = json.loads(line)
    if w.get("onscreen") and w.get("layer", 0) > 0 and w["w"] > 100:
        print(w["id"], int(w["x"]), int(w["y"]), int(w["w"]), int(w["h"])); break
'
}
space() { osascript -e "tell application \"System Events\" to key code $1 using control down"; sleep 1.2; }
WIN=$(findwin)
if [ -z "$WIN" ]; then
  # Only step through Spaces while nobody is using the Mac; the order changes, so look both ways.
  [ "$IDLE0" -lt 100 ] && { echo "not idle (${IDLE0}s); harness window not on this Space" | tee -a "$LOG"; exit 3; }
  for k in 123 123 123 123 124 124 124 124 124 124 124 124; do
    space "$k"; WIN=$(findwin); [ -n "$WIN" ] && break
  done
fi
[ -z "$WIN" ] && { echo "harness window not found on any Space" | tee -a "$LOG"; exit 2; }
read WID WX WY WW WH <<< "$WIN"
echo "window $WID at $WX,$WY ${WW}x$WH" >> "$LOG"
# Window-local CSS px to screen points.
at() { echo $((WX + $1)) $((WY + $2)); }
move() { "$BIN/clickat" $(at "$1" "$2") move 200 >/dev/null; }
click() { "$BIN/clickat" $(at "$1" "$2") click 200 >/dev/null; }
away() { "$BIN/clickat" $((WX - 300)) $((WY + WH / 2)) move 50 >/dev/null; }

CX=$((WW / 2)); CY=$((WH * 55 / 100))
# Open water near the top of the bowl, above the surface: a click there drops food, lower down it knocks.
FY=$((WH * 24 / 100))
startcap() { python3 "$REPO/tools/mac/window_stills.py" "$WID" "$RUN/$1" "$RUN/stop-$1" 0.4 & CAPPID=$!; sleep 1; }
stopcap() { touch "$RUN/stop-$1"; wait "$CAPPID"; }

# Setup: a living, fed pet in daylight, a full feeder, the talk clock at real time, nobody at the glass.
away
sleep 2
if H state | grep -q '"alive":false'; then H newPet >/dev/null; sleep 2; fi
H night '{"value":false}' >/dev/null
H talkSpeed '{"k":1}' >/dev/null
H setPantry '{"n":150}' >/dev/null
H setHunger '{"n":50}' >/dev/null
sleep 3

# Part 1: the moments ----------------------------------------------------------
startcap moments
cap "Nobody at the bowl for five minutes (talk clock 60x)"
H talkSpeed '{"k":60}' >/dev/null
sleep 5
H talkSpeed '{"k":1}' >/dev/null

cap "You come back: it says hello"
move "$CX" "$CY"; sleep 0.3; move $((CX + 20)) $((CY - 10))
sleep 8

cap "Click over the water: a pinch of food"
click "$CX" "$FY"
sleep 22

cap "A knock on the glass (it answers about 6 times in 10)"
for i in 1 2 3; do
  before=$(H transcript | grep -o '"text"' | wc -l)
  H tap "{\"x\":$((WW * 20 / 100)),\"y\":$CY}" >/dev/null
  sleep 7
  after=$(H transcript | grep -o '"text"' | wc -l)
  [ "$after" -gt "$before" ] && break
done
sleep 1

cap "A fact, and where it comes from"
H talk '{"moment":"fact"}' >/dev/null
sleep 4
LINK=$(H transcript | rectmid)
if [ -n "$LINK" ]; then
  read LX LY <<< "$LINK"
  cap "Tap \"Where's that from?\""
  click "$LX" "$LY"
  sleep 4
  LINK2=$(H transcript | rectmid)
  [ -n "$LINK2" ] && read LX LY <<< "$LINK2"
  # Not clicked here: opening it can switch to the browser's full-screen Space mid-recording.
  cap "Tap the source to open it in your browser"
  sleep 4
fi

cap "It gets hungry, then you feed it"
H setPantry '{"n":0}' >/dev/null
H setHunger '{"n":20}' >/dev/null
sleep 9
click "$CX" "$FY"
sleep 24
stopcap moments
H setPantry '{"n":150}' >/dev/null
H setHunger '{"n":90}' >/dev/null

# Part 2: an hour, sped up -----------------------------------------------------
away
H talkSpeed '{"k":120}' >/dev/null
sleep 2
startcap hour
cap "Minute 0: you sit down at the bowl (talk clock 10x)"
H talkSpeed '{"k":10}' >/dev/null
move "$CX" "$CY"; sleep 0.3; move $((CX + 20)) $((CY - 10))
sleep 50
cap "Minutes 8 to 48: you're away (talk clock 120x)"
away
H talkSpeed '{"k":120}' >/dev/null
sleep 20
cap "Minute 48: you come back (talk clock 10x)"
H talkSpeed '{"k":10}' >/dev/null
move "$CX" "$CY"; sleep 0.3; move $((CX - 20)) $((CY + 10))
sleep 50
cap "Minute 56"
sleep 1
stopcap hour
H talkSpeed '{"k":1}' >/dev/null

H transcript > "$RUN/transcript.json"
echo "idle at end: $(idle)s" >> "$LOG"
ls "$RUN/moments" | wc -l >> "$LOG"; ls "$RUN/hour" | wc -l >> "$LOG"
