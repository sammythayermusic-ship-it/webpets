#!/bin/bash
# The checkpoint E recording (docs/reports/checkpoint-E.md): drives the installed WebPets Harness.app.
#   card/        the "Get to know me" window, filled in (harness cardDo, like a person would).
#   chat/        typing to the fish: a real click on it, real keystrokes, real clicks on its buttons.
#   bond/ bond2/ coming back as people who just met, then as best friends.
# It moves the real cursor, types real keys (only while the harness is the front app) and may step
# through Spaces, so run it only while nobody is using the Mac. It puts the cursor and the front app
# back at the end. Join the stills with tools/mac/stills_to_clip.py and <out-dir>/timeline.tsv.
#
#   bash tools/mac/record_getting_to_know.sh <out-dir>
set -u
REPO=$(cd "$(dirname "$0")/../.." && pwd)
BIN=${WP_BIN:-/tmp/webpets-bin}
mkdir -p "$BIN"
for t in winlist clickat mousepos; do
  [ -x "$BIN/$t" ] || swiftc -O "$REPO/tools/mac/$t.swift" -o "$BIN/$t"
done
HAD="$HOME/Library/Application Support/com.sammythayer.webpets.harness"
HARNESS_ID=com.sammythayer.webpets.harness
RUN=${1:?usage: record_getting_to_know.sh <out-dir>}
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

# ---- setup: a living pet in daylight, fed, a fresh profile, a new bond --------------------------------
away
sleep 1
if H state | grep -q '"alive":false'; then H newPet >/dev/null; sleep 2; fi
H night '{"value":false}' >/dev/null
H talkSpeed '{"k":1}' >/dev/null
H setPantry '{"n":150}' >/dev/null
H setHunger '{"n":80}' >/dev/null
H forget >/dev/null
H bond '{"points":0}' >/dev/null

# ---- part 1: the card --------------------------------------------------------------------------------
H openCard >/dev/null
sleep 2.5
CARD=$(findwin "WebPets Harness" "Get to know me")
if [ -n "$CARD" ]; then
  read CID _ _ _ _ <<< "$CARD"
  echo "card window $CID" >> "$LOG"
  startcap "$CID" card
  cap "Get to know me: from the tray, and once on the first launch"
  sleep 2
  cap "What should it call you?"
  H cardDo '{"action":"name","value":"Sam"}' >/dev/null; sleep 1.5
  cap "Teams: pick a league, then the team"
  H cardDo '{"action":"league","value":"mlb"}' >/dev/null; sleep 1.2
  H cardDo '{"action":"team","value":"mlb:2"}' >/dev/null; sleep 1.5
  H cardDo '{"action":"league","value":"nba"}' >/dev/null; sleep 1.2
  H cardDo '{"action":"team","value":"nba:2"}' >/dev/null; sleep 1.5
  cap "Things you like: tap the chips"
  for i in baking space dinosaurs; do H cardDo "{\"action\":\"interest\",\"value\":\"$i\"}" >/dev/null; sleep 1; done
  cap "Or in your own words"
  H cardDo '{"action":"own","value":"bird watching"}' >/dev/null; sleep 2
  cap "It all stays on this Mac. Forget me clears it, after asking"
  H cardDo '{"action":"scroll","value":"2000"}' >/dev/null; sleep 2.5
  H cardDo '{"action":"forget"}' >/dev/null; sleep 3.5
  cap "Done"
  H cardDo '{"action":"done"}' >/dev/null; sleep 1
  stopcap card
else
  echo "card window not found" | tee -a "$LOG"
fi
H profile > "$RUN/profile-after-card.json"

# ---- part 2: typing to the fish ------------------------------------------------------------------------
H talkSpeed '{"k":60}' >/dev/null; sleep 4; H talkSpeed '{"k":1}' >/dev/null
startcap "$WID" chat
cap "You come back"
move "$CX" "$CY"; sleep 0.3; move $((CX + 15)) $((CY - 5))
sleep 5
cap "Click the fish to say something"
read FX FY < <(fish_at)
click "$FX" "$FY"
sleep 1.2
H chatField '{"open":true}' >/dev/null
sleep 1
echo "front after open: $(front)" >> "$LOG"
cap "hi!"
typed "hi!"; sleep 4.5
cap "It already knows your team, from the card"
typed "I love the Red Sox"; sleep 5
cap "Two teams called the Giants: which one?"
typed "go giants"; sleep 3
read BX BY < <(choice_at 1)
[ -n "${BX:-}" ] && click "$BX" "$BY"
sleep 4.5
cap "Something new: it asks before it remembers"
typed "I am learning guitar"; sleep 3
read BX BY < <(choice_at 0)
[ -n "${BX:-}" ] && click "$BX" "$BY"
sleep 4.5
cap "Tell me a joke"
typed "tell me a joke"; sleep 6
cap "It hears how you feel"
typed "I am a bit tired today"; sleep 5.5
cap "Esc: the keyboard goes back to your other app"
osascript -e 'tell application "System Events" to key code 53'
sleep 2
echo "front after esc: $(front)" >> "$LOG"
stopcap chat
H profile > "$RUN/profile-after-chat.json"

# ---- part 3: the bond --------------------------------------------------------------------------------
# Just met: back after a while, it looks up and says hello.
H bond '{"points":0}' >/dev/null
away
H away '{"ms":300000}' >/dev/null
H talkSpeed '{"k":120}' >/dev/null; sleep 3; H talkSpeed '{"k":1}' >/dev/null
startcap "$WID" bond
cap "Just met: you come back"
move $((WW * 25 / 100)) "$CY"; sleep 0.3; move $((WW * 25 / 100 + 10)) $((CY - 4))
sleep 9
away
stopcap bond
# Best friends, four hours after you said you were tired.
H bond '{"points":90}' >/dev/null
H away '{"ms":300000}' >/dev/null
H talkSpeed '{"k":600}' >/dev/null; sleep 26; H talkSpeed '{"k":1}' >/dev/null
H bond '{"points":90}' >/dev/null
H away '{"ms":300000}' >/dev/null
startcap "$WID" bond2
cap "Best friends: it swims to the glass to meet you, and asks how you are"
move $((WW * 25 / 100)) "$CY"; sleep 0.3; move $((WW * 25 / 100 + 10)) $((CY - 4))
sleep 8
cap "It brings up what you told it"
H talk '{"moment":"personal"}' >/dev/null; sleep 6
H talk '{"moment":"personal"}' >/dev/null; sleep 6
cap "Best friends"
sleep 1
stopcap bond2

H transcript > "$RUN/transcript.json"
echo "idle at end: $(idle)s" >> "$LOG"
for d in card chat bond bond2; do echo "$d $(ls "$RUN/$d" 2>/dev/null | wc -l)" >> "$LOG"; done
