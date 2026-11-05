#!/bin/bash
# Probe: in the harness app, make the hamster's team win (or lose), then log where the hamster is
# and what it does once a second. Wheel x 104-166, bed x 21-97, hopper x 165-213 (terrarium.ts).
#   bash probe_cheer.sh won|lost <seconds>
set -u
RESULT=${1:-won}; SECS=${2:-75}
REPO=$(cd "$(dirname "$0")/../.." && pwd)
HAD="$HOME/Library/Application Support/com.sammythayer.webpets.harness"
H() { local a="$2"; [ -z "$a" ] && a='{}'; node "$REPO/tools/harness.mjs" "$1" "$a" --app-data "$HAD" 2>&1; }
sp() { H state '' | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['pet']['species'])"; }
if [ "$(sp)" != "hamster" ]; then
  H newPet '' >/dev/null; sleep 2
  H species '{"species":"hamster","habitat":"terrarium"}' >/dev/null
  for i in $(seq 1 12); do sleep 2; [ "$(sp 2>/dev/null)" = "hamster" ] && break; done
fi
echo "species: $(sp)"
H setHunger '{"n":80}' >/dev/null; H setPantry '{"n":150}' >/dev/null
H profile '{"set":{"name":"Sam","teams":["nba:2"],"interests":["dinosaurs","space"],"own":[]}}' >/dev/null
sleep 3
if [ "$RESULT" = won ]; then US=112; THEM=104; else US=98; THEM=107; fi
H world "{\"do\":\"force\",\"result\":\"$RESULT\",\"us\":$US,\"them\":$THEM}" | python3 -c "import json,sys; d=json.load(sys.stdin); print('force:', d.get('ok'), str(d.get('data'))[:160])"
for i in $(seq 1 "$SECS"); do
  H state '' | python3 -c "
import json,sys; d=json.load(sys.stdin)['data']; s=d['scene']
x=s['drawnPos']['x']; where='wheel' if 104<=x<=166 else 'bed' if x<=97 else 'hopper' if 165<=x<=213 else 'floor'
print($i, 'x=%.0f' % x, where, s.get('petAnim'), s.get('act',''), 'vis', d.get('visibility'), 'energy', round(d['needs']['energy']['value'],2))"
  sleep 1
done
