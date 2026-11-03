#!/bin/bash
# The checkpoint F2 recording (docs/reports/checkpoint-F2.md): drives the installed WebPets Harness.app.
#   share/  a milestone (your team's win), and a real click on its "Share this" button, which saves
#           the last few seconds into Downloads.
# Then makes the pet card (harness `share card`). Both files land in ~/Downloads and are selected in
# Finder; their paths are in <out-dir>/shared.txt. Clicks with the real cursor, so run it only while
# nobody is using the Mac.
#
#   bash tools/mac/record_share.sh <out-dir>
set -u
REPO=$(cd "$(dirname "$0")/../.." && pwd)
BIN=${WP_BIN:-/tmp/webpets-bin}
mkdir -p "$BIN"
for t in winlist clickat mousepos; do
  [ -x "$BIN/$t" ] || swiftc -O "$REPO/tools/mac/$t.swift" -o "$BIN/$t"
done
HAD="$HOME/Library/Application Support/com.sammythayer.webpets.harness"
HARNESS_ID=com.sammythayer.webpets.harness
RUN=${1:?usage: record_share.sh <out-dir>}
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
front() { lsappinfo info -only bundleid "$(lsappinfo front)" | sed -E 's/.*="(.*)"/\1/'; }
js() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)" 2>/dev/null; }

IDLE0=$(idle)
echo "idle at start: ${IDLE0}s" >> "$LOG"
FRONT=$(front)
read MX MY < <("$BIN/mousepos")
restore() {
  "$BIN/clickat" "$MX" "$MY" move 50 >/dev/null 2>&1
  [ -n "$FRONT" ] && open -b "$FRONT"
}
trap restore EXIT

findwin() { # owner [name]
  "$BIN/winlist" "$1" | python3 -c '
import json, sys
want = sys.argv[1] if len(sys.argv) > 1 else ""
for line in sys.stdin:
    w = json.loads(line)
    if w.get("onscreen") and w["w"] > 100 and (w.get("name") == want if want else w.get("layer", 0) > 0):
        print(w["id"], int(w["x"]), int(w["y"]), int(w["w"]), int(w["h"])); break
' "${2-}"
}
space() { osascript -e "tell application \"System Events\" to key code $1 using control down"; sleep 1.2; }
WIN=$(findwin "WebPets Harness")
if [ -z "$WIN" ]; then
  [ "$IDLE0" -lt 100 ] && { echo "not idle (${IDLE0}s); harness window not on this Space" | tee -a "$LOG"; exit 3; }
  for k in 123 123 123 123 124 124 124 124 124 124 124 124; do
    space "$k"; WIN=$(findwin "WebPets Harness"); [ -n "$WIN" ] && break
  done
fi
[ -z "$WIN" ] && { echo "harness window not found on any Space" | tee -a "$LOG"; exit 2; }
read WID WX WY WW WH <<< "$WIN"
echo "window $WID at $WX,$WY ${WW}x$WH" >> "$LOG"
at() { echo $((WX + $1)) $((WY + $2)); }
move() { "$BIN/clickat" $(at "$1" "$2") move 200 >/dev/null; }
click() { "$BIN/clickat" $(at "$1" "$2") click 200 >/dev/null; }
away() { "$BIN/clickat" $((WX - 300)) $((WY + WH / 2)) move 50 >/dev/null; }
# A size that reads well in a clip: 2x.
H scale '{"steps":16}' >/dev/null
sleep 2
WIN=$(findwin "WebPets Harness")
read WID WX WY WW WH <<< "$WIN"
echo "window after scale $WID at $WX,$WY ${WW}x$WH" >> "$LOG"
CX=$((WW / 2)); CY=$((WH * 55 / 100))
startcap() { python3 "$REPO/tools/mac/window_stills.py" "$1" "$RUN/$2" "$RUN/stop-$2" 0.4 & CAPPID=$!; sleep 1; }
stopcap() { touch "$RUN/stop-$1"; wait "$CAPPID"; }
# Type into the pet only while the harness has the keyboard; otherwise the keys would land elsewhere.
typed() {
  local f; f=$(front)
  if [ "$f" != "$HARNESS_ID" ]; then echo "NOT TYPING: front app is $f" | tee -a "$LOG"; return 1; fi
  osascript -e "tell application \"System Events\" to keystroke \"$1\""
  sleep 0.4
  osascript -e 'tell application "System Events" to key code 36'
}
# The centre of the n-th button under the bubble (0-based), window-local.
choice_at() { H transcript | python3 -c "
import json,sys
r = json.load(sys.stdin).get('data', {}).get('rects', [])
r = [x for x in r if x['h'] < 30]
i = $1
print(int(r[i]['x'] + r[i]['w'] / 2), int(r[i]['y'] + r[i]['h'] / 2)) if len(r) > i else print('')
"; }
# Where the fish is drawn, window-local CSS px.
fish_at() { H state | python3 -c "
import json,sys
d = json.load(sys.stdin)['data']
f = d['settings']['scale'] / 8
p = d['scene']['drawnPos']
print(int(24 + p['x'] * f), int(24 + p['y'] * f))
"; }

# ---- setup: a living pet in daylight, fed, close to you, following the Celtics ------------------------
away
sleep 1
if H state | grep -q '"alive":false'; then H newPet >/dev/null; sleep 2; fi
H night '{"value":false}' >/dev/null
H talkSpeed '{"k":1}' >/dev/null
H setPantry '{"n":150}' >/dev/null
H setHunger '{"n":80}' >/dev/null
H profile '{"set":{"name":"Sam","teams":["nba:2"],"interests":["dinosaurs","space"],"own":[]}}' >/dev/null
H bond '{"points":90}' >/dev/null
sleep 6

# ---- a moment worth sharing, and the button ---------------------------------------------------------
startcap "$WID" share
cap "A moment worth sharing: your team won"
H milestone '{"moment":"big-win"}' >/dev/null
sleep 6
# Hover first: the HUD bar comes in along the top and the bubble drops below it, so read the button
# where it is once the pointer is over the window.
read FX FY < <(fish_at)
move "$FX" "$FY"
sleep 1.2
H transcript > "$RUN/before-click.json"
read BX BY < <(choice_at 0)
before=$(ls "$HOME/Downloads" | grep -c "\.mp4$")
if [ -n "${BX:-}" ]; then
  cap "Share this: the last few seconds, saved"
  echo "clicking Share this at window $BX,$BY (screen $(at "$BX" "$BY"))" >> "$LOG"
  click "$BX" "$BY"
fi
sleep 9
if [ "$(ls "$HOME/Downloads" | grep -c "\.mp4$")" -le "$before" ]; then
  echo "the click did not save a clip; pressing the button through the harness" >> "$LOG"
  H choose '{"value":"share"}' >/dev/null
  sleep 9
fi
sleep 1
stopcap share
H transcript > "$RUN/transcript.json"
ls -t "$HOME/Downloads" | head -3 > "$RUN/downloads-after-clip.txt"

# ---- the pet card -------------------------------------------------------------------------------------
H share '{"what":"card"}' | tee "$RUN/card.json" >/dev/null
sleep 2
python3 -c "
import json, sys
print(json.load(open('$RUN/card.json')).get('data', {}).get('path', ''))
" > "$RUN/shared.txt"
echo "$HOME/Downloads/$(head -1 "$RUN/downloads-after-clip.txt")" >> "$RUN/shared.txt"
echo "idle at end: $(idle)s" >> "$LOG"
