#!/bin/bash
set -e
cd "$(dirname "$0")/../.."
export CARGO_TARGET_DIR=$HOME/.cache/webpets/target
BD=$CARGO_TARGET_DIR/release/bundle/macos
# `build_both.sh harness` builds and installs only the test app, leaving the running pet alone.
if [ "${1:-}" != "harness" ]; then
echo "== release build $(date +%T)"
npm run tauri build -- --bundles app </dev/null
echo "== install WebPets.app $(date +%T)"
pkill -f "^/Applications/WebPets.app/Contents/MacOS/webpets" || true
sleep 1
ditto "$BD/WebPets.app" /Applications/WebPets.app
open -g /Applications/WebPets.app
fi
echo "== harness build $(date +%T)"
# The test app also keeps its page awake while hidden (backgroundThrottling). It is driven while its
# window sits behind everything, often on another Space, and macOS puts a hidden page to sleep for
# minutes at a time: at checkpoint 5 it stopped answering for four minutes mid-walk. The window list
# is replaced whole by a config override, so it is copied from tauri.conf.json with the one key added.
HARNESS_CONF=$(python3 - <<'PY'
import json
c = json.load(open("src-tauri/tauri.conf.json"))
wins = c["app"]["windows"]
wins[0]["backgroundThrottling"] = "disabled"
print(json.dumps({"identifier": "com.sammythayer.webpets.harness", "productName": "WebPets Harness", "app": {"windows": wins}}))
PY
)
npm run build:harness -- --config "$HARNESS_CONF" </dev/null
echo "== install harness $(date +%T)"
pkill -f "^/Applications/WebPets Harness.app/Contents/MacOS/webpets" || true
sleep 1
ditto "$BD/WebPets Harness.app" "/Applications/WebPets Harness.app"
echo "== done $(date +%T)"
