#!/bin/bash
# The checkpoint G recording (docs/reports/checkpoint-G.md): the hamster with the whole brain, in the
# installed WebPets Harness.app.
#   talk/  a thought in its own voice, a knock on the glass, a fact with its source.
#   chat/  typing to the hamster: a real click on it, real keystrokes.
#   win/   a test win for your team: the result line, victory sprints on the wheel, a happy line later.
#   loss/  a test loss: the result line, keeping to its house, a mopey line.
# Switches the harness pet to the hamster first and back to the fish at the end. Moves the real cursor
# and types, so run it only while nobody is using the Mac, and never clicks outside the harness window.
# Join the stills with tools/mac/stills_to_clip.py and <out-dir>/timeline.tsv.
#
#   bash tools/mac/record_hamster.sh <out-dir>
set -u
# PARTS="talk chat" records only some of the parts.
PARTS=" ${PARTS:-talk chat win loss} "
has() { [[ "$PARTS" == *" $1 "* ]]; }
REPO=$(cd "$(dirname "$0")/../.." && pwd)
BIN=${WP_BIN:-/tmp/webpets-bin}
mkdir -p "$BIN"
for t in winlist clickat mousepos; do
  [ -x "$BIN/$t" ] || swiftc -O "$REPO/tools/mac/$t.swift" -o "$BIN/$t"
done
HAD="$HOME/Library/Application Support/com.sammythayer.webpets.harness"
HARNESS_ID=com.sammythayer.webpets.harness
RUN=${1:?usage: record_hamster.sh <out-dir>}
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

IDLE0=$(idle)
echo "idle at start: ${IDLE0}s" >> "$LOG"
[ "$IDLE0" -lt 100 ] && { echo "not idle (${IDLE0}s); stopping" | tee -a "$LOG"; exit 3; }
# A locked screen is idle too, but every window is off-screen behind it, clicks land on the lock
# screen, and WebKit holds the page as hidden (no bubble, no chat field). Wait for an unlock instead.
locked() { ioreg -n Root -d1 | awk -F'= ' '/IOConsoleLocked/ {print $2; exit}'; }
[ "$(locked)" = "Yes" ] && { echo "screen is locked; stopping" | tee -a "$LOG"; exit 3; }
FRONT=$(front)
read MX MY < <("$BIN/mousepos")
restore() {
  [ -n "$POLLPID" ] && kill "$POLLPID" 2>/dev/null
  # Back to the fish, so the other drivers find the pet they expect.
  H species '{"species":"fish","habitat":"bowl"}' >/dev/null
  "$BIN/clickat" "$MX" "$MY" move 50 >/dev/null 2>&1
  [ -n "$FRONT" ] && open -b "$FRONT"
  echo "idle at end: $(idle)s" >> "$LOG"
}
trap restore EXIT

findwin() { # owner: the habitat window is the one not at the ordinary level
  "$BIN/winlist" "$1" | python3 -c '
import json, sys
want = sys.argv[1]
for line in sys.stdin:
    w = json.loads(line)
    if w.get("onscreen") and w["w"] > 100 and w.get("owner") == want and w["layer"] != 0:
        print(w["id"], int(w["x"]), int(w["y"]), int(w["w"]), int(w["h"])); break
' "$1"
}
space() { osascript -e "tell application \"System Events\" to key code $1 using control down"; sleep 1.2; }
WIN=$(findwin "WebPets Harness")
if [ -z "$WIN" ]; then
  for k in 123 123 123 124 124 124 124 124 124; do
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
startcap() {
  # Warm up first: the first capture of a window after a reload can take seconds or fail outright
  # ("could not create image from window"), and the part's opening seconds would have no stills.
  local i t0
  for i in 1 2 3; do
    t0=$(ms)
    screencapture -x -o "-l$1" "$RUN/warmup.png" 2>>"$LOG" && [ -s "$RUN/warmup.png" ] && break
    echo "warm-up capture $i failed after $(( $(ms) - t0 )) ms" >> "$LOG"
  done
  echo "warm-up capture for $2 took $(( $(ms) - t0 )) ms" >> "$LOG"
  rm -f "$RUN/warmup.png"
  python3 "$REPO/tools/mac/window_stills.py" "$1" "$RUN/$2" "$RUN/stop-$2" 0.4 & CAPPID=$!; sleep 1
}
# WP_POLL=1 logs the pet's position and act once a second to <out>/poll.tsv, to check the stills
# against (was it really on the wheel?).
POLLPID=
if [ "${WP_POLL:-0}" = 1 ]; then
  ( while :; do
      node "$REPO/tools/harness.mjs" state '{}' --app-data "$HAD" 2>/dev/null | python3 -c "
import json,sys,time
try:
    d=json.load(sys.stdin)['data']; s=d['scene']
    print(int(time.time()*1000), round(s['petPos']['x'],1), round(s['petPos']['y'],1), s.get('petAct','-'), s['petAnim'], d['visibility'], round(d['needs']['energy']['value'],2), sep='\t')
except Exception as e: print(int(time.time()*1000), 'err', e, sep='\t')
" >> "$RUN/poll.tsv"
      sleep 1
    done ) &
  POLLPID=$!
fi
stopcap() { touch "$RUN/stop-$1"; wait "$CAPPID"; }
# Type into the pet only while the harness has the keyboard; otherwise the keys would land elsewhere.
typed() {
  local f; f=$(front)
  if [ "$f" != "$HARNESS_ID" ]; then echo "NOT TYPING: front app is $f" | tee -a "$LOG"; return 1; fi
  osascript -e "tell application \"System Events\" to keystroke \"$1\""
  sleep 0.4
  osascript -e 'tell application "System Events" to key code 36'
}
# Where the pet is drawn, window-local CSS px.
pet_at() { H state | python3 -c "
import json,sys
d = json.load(sys.stdin)['data']
f = d['settings']['scale'] / 8
p = d['scene']['drawnPos']
print(int(24 + p['x'] * f), int(24 + p['y'] * f))
"; }
species_now() { H state | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['pet']['species'])"; }

# ---- setup: the hamster in its terrarium, daylight, fed, close to you, following the Celtics ------------
away
sleep 1
# A fresh pet: rested, so it is awake for the clip (a harness pet driven all day runs its energy down
# and sleeps through everything; the first run recorded exactly that).
H newPet >/dev/null; sleep 2
if [ "$(species_now)" != "hamster" ]; then
  H species '{"species":"hamster","habitat":"terrarium"}' >/dev/null
  for i in 1 2 3 4 5 6 7 8 9 10; do sleep 2; [ "$(species_now 2>/dev/null)" = "hamster" ] && break; done
  echo "species now: $(species_now)" >> "$LOG"
fi
H scale '{"steps":16}' >/dev/null
sleep 2
WIN=$(findwin "WebPets Harness"); read WID WX WY WW WH <<< "$WIN"
echo "window after scale $WID at $WX,$WY ${WW}x$WH" >> "$LOG"
CX=$((WW / 2)); CY=$((WH * 55 / 100))
H night '{"value":false}' >/dev/null
H talkSpeed '{"k":1}' >/dev/null
H setPantry '{"n":150}' >/dev/null
H setHunger '{"n":80}' >/dev/null
H profile '{"set":{"name":"Sam","teams":["nba:2"],"interests":["dinosaurs","space"],"own":[]}}' >/dev/null
H bond '{"points":90}' >/dev/null
sleep 6

if has talk; then
# ---- its own voice --------------------------------------------------------------------------------------
startcap "$WID" talk
cap "You come back"
# The pointer first: after the reload WebKit may hold the page as hidden, and a hidden page stops
# painting the bubble (the canvas keeps going on its worker tick, so the stills look fine but say nothing).
move "$CX" "$CY"; sleep 0.3; move $((CX + 15)) $((CY - 5))
sleep 5
echo "visibility: $(H state | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(d['visibility'], d['scene']['petAnim'], 'energy', round(d['needs']['energy']['value'],2))")" >> "$LOG"
cap "The hamster, with the whole brain: a thought in its own voice"
H talk '{"moment":"thought"}' >/dev/null
sleep 9
cap "Knock on the glass"
click "$CX" $((WH * 30 / 100))
sleep 8
cap "A fact, with its source"
H talk '{"moment":"fact"}' >/dev/null
sleep 10
stopcap talk
fi

if has chat; then
# ---- typing to the hamster -----------------------------------------------------------------------------
sleep 5
startcap "$WID" chat
cap "Click the hamster to say something"
move "$CX" "$CY"; sleep 0.3
read PX PY < <(pet_at)
click "$PX" "$PY"
sleep 1.2
H chatField '{"open":true}' >/dev/null
sleep 1
echo "front after open: $(front)" >> "$LOG"
cap "hi!"
typed "hi!"; sleep 4.5
cap "what are you doing?"
typed "what are you doing?"; sleep 5
cap "tell me a joke"
typed "tell me a joke"; sleep 6
cap "It hears how you feel"
typed "I had a rough day"; sleep 5.5
cap "Esc: the keyboard goes back to your other app"
osascript -e 'tell application "System Events" to key code 53'
sleep 2
echo "front after esc: $(front)" >> "$LOG"
stopcap chat
fi

if has win; then
# ---- a win day -----------------------------------------------------------------------------------------
sleep 5
away
startcap "$WID" win
cap "Your team won (a test result, from the dev panel)"
H world '{"do":"force","result":"won","us":112,"them":104}' >/dev/null
sleep 9
cap "Happy the rest of the day: victory sprints on the wheel"
sleep 32
cap "Still happy, later on"
H talk '{"moment":"mood"}' >/dev/null
sleep 8
stopcap win
fi

if has loss; then
# ---- a loss day ----------------------------------------------------------------------------------------
sleep 7
startcap "$WID" loss
cap "Your team lost (a test result, from the dev panel)"
H world '{"do":"force","result":"lost","us":98,"them":107}' >/dev/null
sleep 9
cap "Sad until tomorrow noon: it keeps to its house, slowly"
sleep 26
cap "Still moping, later on"
H talk '{"moment":"mood"}' >/dev/null
sleep 8
stopcap loss
fi

H transcript > "$RUN/transcript.json"
H state > "$RUN/state.json"
for d in talk chat win loss; do echo "$d $(ls "$RUN/$d" 2>/dev/null | wc -l)" >> "$LOG"; done
