#!/bin/bash
# The checkpoint 4 recording (docs/reports/checkpoint-4.md): each pet doing the same things in the
# same order, so a "before" take from one build and an "after" take from the next can be laid side by
# side (tools/mac/side_by_side.py). Canvas-only, like record_environments.sh: no cursor, typing,
# Spaces or screen capture; the screen must be unlocked.
#
#   bash tools/mac/record_animation.sh <out-dir> <tag>     # tag: before | after
set -u
REPO=$(cd "$(dirname "$0")/../.." && pwd)
HAD="$HOME/Library/Application Support/com.sammythayer.webpets.harness"
OUT=${1:?usage: record_animation.sh <out-dir> <tag>}
TAG=${2:?usage: record_animation.sh <out-dir> <tag>}
PARTS=" ${PARTS:-hamster fish} "
has() { [[ "$PARTS" == *" $1 "* ]]; }
mkdir -p "$OUT"
LOG=$OUT/log-$TAG.txt
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
print(d['pet']['species'], d['pet']['habitat'], s.get('petAnim'), s.get('petAct','-'), round(s['petPos']['x'],1), round(s['petPos']['y'],1), d['pet']['alive'], round(d['needs']['energy']['value'],2))"; }
pet_css() { H state | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']; f=d['settings']['scale']/8; p=d['scene']['drawnPos']
print(int(24+p['x']*f), int(24+p['y']*f))"; }
clip() { # name seconds
  log "record $TAG-$1 ($2 s) :: $(state_of)"
  local f
  f=$(H record "{\"name\":\"anim-$TAG-$1\",\"seconds\":$2,\"fps\":30}" $(( $2 + 60 )) | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['file'])")
  for i in $(seq 1 40); do [ -s "$f" ] && break; sleep 0.5; done
  sleep 1
  cp "$f" "$OUT/$TAG-$1.${f##*.}"
}
setup() { # species habitat
  H species "{\"species\":\"$1\",\"habitat\":\"$2\"}" >/dev/null
  for i in $(seq 1 20); do sleep 2; [ "$(state_of 2>/dev/null | cut -d' ' -f2)" = "$2" ] && break; done
  H scale '{"steps":16}' >/dev/null
  H hour '{"value":12}' >/dev/null
  H setHunger '{"n":70}' >/dev/null
  H setPantry '{"n":150}' >/dev/null
  H setNeeds '{"energy":1,"stress":0}' >/dev/null
  sleep 3
}
sequence() { # pet
  clip "$1-wander" 14
  read X Y < <(pet_css)
  H tap "{\"x\":$X,\"y\":$((Y - 20))}" >/dev/null
  clip "$1-tap" 6
  H feed >/dev/null
  clip "$1-eat" 14
  H hour '{"value":22}' >/dev/null
  clip "$1-bed" 14
  H hour '{"value":12}' >/dev/null
  H setNeeds '{"energy":1}' >/dev/null
  clip "$1-wake" 8
}

H newPet >/dev/null
sleep 3
if has hamster; then
  setup hamster terrarium
  sequence hamster
  # the wheel: a win sends it on victory sprints, one every 25 s of cheering
  H profile '{"set":{"name":"Sam","teams":["nba:2"],"interests":[],"own":[]}}' >/dev/null
  H world '{"do":"force","result":"won","us":112,"them":104}' >/dev/null
  sleep 24
  clip "hamster-wheel" 14
  H force '{"state":"dead"}' >/dev/null
  clip "hamster-die" 6
  H newPet >/dev/null
  sleep 3
fi
if has fish; then
  setup fish bowl
  sequence fish
fi
H hour '{"value":null}' >/dev/null
H species '{"species":"fish","habitat":"bowl"}' >/dev/null
log "done"
