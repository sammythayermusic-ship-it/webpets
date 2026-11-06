#!/bin/bash
# The checkpoint 3 recording (docs/reports/checkpoint-3.md): each habitat at morning, noon, evening
# and night with the pet asleep, so the environment carries the scene on its own; then the ambient
# life up close (the wheel spinning and coasting, the bedding dug at bedtime, the bowl clouding while
# the fish starves and clearing after a feed).
#
# Canvas-only: every clip is the harness's own `record` (canvas.captureStream), so nothing here moves
# the cursor, types, switches Spaces or captures the screen. It needs the harness app running and the
# screen unlocked (a locked screen hides the page and slows its clock).
#
#   bash tools/mac/record_environments.sh <out-dir>
# then: python3 tools/mac/caption_clips.py <out-dir> docs/reports/checkpoint-3
set -u
REPO=$(cd "$(dirname "$0")/../.." && pwd)
HAD="$HOME/Library/Application Support/com.sammythayer.webpets.harness"
OUT=${1:?usage: record_environments.sh <out-dir>}
PARTS=" ${PARTS:-bowl terrarium cage life} "
has() { [[ "$PARTS" == *" $1 "* ]]; }
mkdir -p "$OUT"
LOG=$OUT/log.txt
: >> "$LOG"
H() {
  local args="${2-}"
  [ -z "$args" ] && args='{}'
  node "$REPO/tools/harness.mjs" "$1" "$args" --app-data "$HAD" --timeout "${3:-60}" 2>&1
}
log() { echo "[$(date +%T)] $*" | tee -a "$LOG"; }
locked() { ioreg -n Root -d1 | awk -F'= ' '/IOConsoleLocked/ {print $2; exit}'; }
[ "$(locked)" = "Yes" ] && { log "screen is locked; stopping"; exit 3; }
state_of() { H state | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']; s=d['scene']
print(d['pet']['species'], d['pet']['habitat'], s.get('petAnim'), s.get('petAct','-'), json.dumps(s.get('light')), d['visibility'], round(d['needs']['energy']['value'],2), json.dumps(s.get('ambient')), json.dumps((s.get('live') or {}).get('murk')))"; }
# A clip, copied out of the harness folder under a stable name, with what the scene said as it began.
clip() { # name seconds caption
  log "record $1 ($2 s): $3 :: $(state_of)"
  local f
  f=$(H record "{\"name\":\"env-$1\",\"seconds\":$2,\"fps\":30}" $(( $2 + 60 )) | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['file'])")
  # record is detached: its file lands a moment after the result
  for i in $(seq 1 40); do [ -s "$f" ] && break; sleep 0.5; done
  sleep 1
  local ext=${f##*.}
  cp "$f" "$OUT/$1.$ext"
  printf '%s\t%s\n' "$1.$ext" "$3" >> "$OUT/captions.tsv"
}
habitat() { # species habitat
  log "species $1/$2"
  H species "{\"species\":\"$1\",\"habitat\":\"$2\"}" >/dev/null
  for i in $(seq 1 20); do sleep 2; [ "$(state_of 2>/dev/null | cut -d' ' -f2)" = "$2" ] && break; done
  H scale '{"steps":16}' >/dev/null
  H setHunger '{"n":85}' >/dev/null
  H setPantry '{"n":150}' >/dev/null
}
hours() { # short-name label
  for h in 7 12 18 22; do
    case $h in 7) name="morning";; 12) name="noon";; 18) name="evening";; 22) name="night";; esac
    H hour "{\"value\":$h}" >/dev/null
    # tired, so it sleeps by day as well as by night
    H setNeeds '{"energy":0}' >/dev/null
    sleep 4
    # Wait until it is really asleep: a tired pet takes a while to settle for a nap by day.
    for i in $(seq 1 30); do
      [ "$(state_of 2>/dev/null | cut -d' ' -f3)" = "sleep" ] && break
      H setNeeds '{"energy":0}' >/dev/null
      sleep 2
    done
    sleep 2
    clip "$1-$h" 8 "$2, ${name} ($(printf '%02d' $h):00). The pet asleep; the habitat on its own."
  done
}

: > "$OUT/captions.tsv"
H newPet >/dev/null
sleep 3

if has bowl; then
  habitat fish bowl
  # A day nap needs five quiet minutes since the last stimulus (src/sim/needs.ts NAP_QUIET_MS), and a
  # new pet is one. The hamster homes come later in the run and have had theirs by then.
  H setNeeds '{"energy":0}' >/dev/null
  log "five quiet minutes for the fish"
  sleep "${QUIET_S:-310}"
  hours bowl "The bowl"
fi
if has terrarium; then
  habitat hamster terrarium
  hours terr "The terrarium"
fi
if has cage; then
  habitat hamster cage
  hours cage "The cage"
fi

if has life; then
  # The wheel: a win sends the hamster on victory sprints (one every 25 s of cheering); it spins up,
  # runs, hops off, and the wheel coasts down after it.
  habitat hamster terrarium
  H hour '{"value":12}' >/dev/null
  H setNeeds '{"energy":1}' >/dev/null
  H profile '{"set":{"name":"Sam","teams":["nba:2"],"interests":[],"own":[]}}' >/dev/null
  H world '{"do":"force","result":"won","us":112,"them":104}' >/dev/null
  sleep 24
  clip "life-wheel" 26 "The wheel: it spins up when the hamster runs it, and coasts down after it hops off."
  # Bedtime: it walks to its house and digs its bed over before it settles; the doorway darkens.
  H setNeeds '{"energy":1}' >/dev/null
  H hour '{"value":12}' >/dev/null
  sleep 3
  H hour '{"value":22}' >/dev/null
  clip "life-bedtime" 14 "Bedtime: the light bar comes on, it digs its bed over, the moth comes to the light."
  # The bowl: the water clouds while the fish starves, and clears after a feed.
  habitat fish bowl
  H hour '{"value":12}' >/dev/null
  H setNeeds '{"energy":1}' >/dev/null
  H setHunger '{"n":0}' >/dev/null
  sleep 2
  clip "life-murk" 22 "Starving: the water clouds over. The plants sway, and bend as the fish passes."
  H feed >/dev/null
  clip "life-clear" 22 "Fed: the water clears over the next minute or so."
  H setHunger '{"n":85}' >/dev/null
fi

H hour '{"value":null}' >/dev/null
H species '{"species":"fish","habitat":"bowl"}' >/dev/null
log "done"
