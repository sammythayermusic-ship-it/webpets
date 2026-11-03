#!/bin/bash
# The checkpoint F recording (docs/reports/checkpoint-F.md): drives the installed WebPets Harness.app.
#   win/   a test win for your team: the result line, laps of the bowl, a happy line later.
#   loss/  a test loss: the result line, sulking low with folded fins, a mopey line.
#   news/  a morning of news: headlines it fetched, one opened to its source.
# Results are forced (harness `world force`, like the dev panel's TEST WIN / TEST LOSS); the news is
# real, fetched tonight. Clicks the bubble's source link with the real cursor, so run it only while
# nobody is using the Mac. Join the stills with tools/mac/stills_to_clip.py and <out-dir>/timeline.tsv.
#
#   bash tools/mac/record_world.sh <out-dir>
set -u
REPO=$(cd "$(dirname "$0")/../.." && pwd)
BIN=${WP_BIN:-/tmp/webpets-bin}
mkdir -p "$BIN"
for t in winlist clickat mousepos; do
  [ -x "$BIN/$t" ] || swiftc -O "$REPO/tools/mac/$t.swift" -o "$BIN/$t"
done
HAD="$HOME/Library/Application Support/com.sammythayer.webpets.harness"
HARNESS_ID=com.sammythayer.webpets.harness
RUN=${1:?usage: record_world.sh <out-dir>}
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

# ---- setup: a living pet in daylight, fed, following the Celtics, news fetched ----------------------
away
sleep 1
if H state | grep -q '"alive":false'; then H newPet >/dev/null; sleep 2; fi
H night '{"value":false}' >/dev/null
H talkSpeed '{"k":1}' >/dev/null
H setPantry '{"n":150}' >/dev/null
H setHunger '{"n":80}' >/dev/null
H profile '{"set":{"name":"Sam","teams":["nba:2"],"interests":["dinosaurs","space"],"own":[]}}' >/dev/null
H world '{"do":"refresh","what":"news"}' >/dev/null
H world '{"do":"refresh","what":"news"}' >/dev/null
sleep 8

# ---- a win day -----------------------------------------------------------------------------------------
startcap "$WID" win
cap "Your team won (a test result, from the dev panel)"
H world '{"do":"force","result":"won","us":112,"them":104}' >/dev/null
sleep 9
cap "Happy the rest of the day: laps of the bowl"
sleep 30
cap "Still happy, later on"
H talk '{"moment":"mood"}' >/dev/null
sleep 8
stopcap win

# ---- a loss day ----------------------------------------------------------------------------------------
sleep 7
startcap "$WID" loss
cap "Your team lost (a test result, from the dev panel)"
H world '{"do":"force","result":"lost","us":98,"them":107}' >/dev/null
sleep 9
cap "Sad until tomorrow noon: low in the bowl, slow, fins folded"
sleep 24
cap "Still moping, later on"
H talk '{"moment":"mood"}' >/dev/null
sleep 8
stopcap loss

# ---- a morning of news ---------------------------------------------------------------------------------
sleep 7
startcap "$WID" news
cap "A morning of news: real headlines it fetched, light ones only"
H talk '{"moment":"news"}' >/dev/null
sleep 9
H talk '{"moment":"news"}' >/dev/null
sleep 3
read LX LY < <(H transcript | python3 -c "
import json,sys
r = json.load(sys.stdin).get('data', {}).get('linkRect')
print(int(r['x'] + r['w'] / 2), int(r['y'] + r['h'] / 2)) if r else print('')
")
if [ -n "${LX:-}" ]; then
  cap "Tap: where it is from"
  click "$LX" "$LY"
  sleep 5
fi
cap "A morning of news: real headlines it fetched, light ones only"
H talk '{"moment":"news"}' >/dev/null
sleep 9
H talk '{"moment":"news"}' >/dev/null
sleep 9
stopcap news

H transcript > "$RUN/transcript.json"
H world > "$RUN/world.json"
echo "idle at end: $(idle)s" >> "$LOG"
for d in win loss news; do echo "$d $(ls "$RUN/$d" 2>/dev/null | wc -l)" >> "$LOG"; done
