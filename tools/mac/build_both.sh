#!/bin/bash
set -e
cd "$(dirname "$0")/../.."
export CARGO_TARGET_DIR=$HOME/.cache/webpets/target
BD=$CARGO_TARGET_DIR/release/bundle/macos
echo "== release build $(date +%T)"
npm run tauri build -- --bundles app </dev/null
echo "== install WebPets.app $(date +%T)"
pkill -f "^/Applications/WebPets.app/Contents/MacOS/webpets" || true
sleep 1
ditto "$BD/WebPets.app" /Applications/WebPets.app
open /Applications/WebPets.app
echo "== harness build $(date +%T)"
npm run build:harness -- --config '{"identifier":"com.sammythayer.webpets.harness","productName":"WebPets Harness"}' </dev/null
echo "== install harness $(date +%T)"
pkill -f "^/Applications/WebPets Harness.app/Contents/MacOS/webpets" || true
sleep 1
ditto "$BD/WebPets Harness.app" "/Applications/WebPets Harness.app"
echo "== done $(date +%T)"
