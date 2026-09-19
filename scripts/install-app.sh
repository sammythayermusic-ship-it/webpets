#!/usr/bin/env bash
#
# Build WebPets and install it at ONE canonical path.
#
# Every copy of the app shares the bundle id `com.sammythayer.webpets`, so macOS cannot tell two builds
# apart: double-clicking a freshly built copy while an older one is running routes the launch to the
# OLD process, which comes forward looking current. Copying each new build next to the last one -- which
# is what Finder does, appending " 2", " 3" -- therefore does not give you a choice of builds, it gives
# you a coin flip. This script removes the choice: one path, always replaced, old process quit first.
#
# Usage: npm run install:app
set -euo pipefail

APP_NAME="WebPets.app"
DEST="/Applications/$APP_NAME"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILT="$ROOT/src-tauri/target/release/bundle/macos/$APP_NAME"

# Quit any running copy, matched on the EXECUTABLE name rather than the bundle path.
#
# This is the lesson, not a style choice: a `pkill -f "WebPets.app/Contents/MacOS/webpets"` silently
# matched nothing when the bundle Finder had created was named "WebPets 3.app", and the stale build
# stayed on screen through an entire debugging session while every fix went to a copy nobody was
# running. The executable is called `webpets` no matter what the folder around it is called.
if pkill -x webpets 2>/dev/null; then
  echo "==> quit a running WebPets"
  # The single-instance lock is released on exit; opening the new copy before that would be routed
  # straight back to the process that is still shutting down.
  sleep 1
fi

echo "==> building"
npm run tauri build -- --bundles app

[ -d "$BUILT/Contents/MacOS" ] || {
  echo "build did not produce $BUILT" >&2
  exit 1
}

# Guard the delete on the destination actually being a WebPets bundle. $DEST is a constant two lines
# up, so this can only fire if someone edits it wrongly -- which is exactly when an `rm -rf` of a path
# under /Applications should refuse rather than proceed.
if [ -e "$DEST" ] && [ ! -x "$DEST/Contents/MacOS/webpets" ]; then
  echo "$DEST exists but is not a WebPets bundle; refusing to replace it" >&2
  exit 1
fi

echo "==> installing to $DEST"
rm -rf "$DEST"
ditto "$BUILT" "$DEST"

echo "==> launching"
open "$DEST"
echo "==> installed: $DEST (linked $(date -r "$DEST/Contents/MacOS/webpets" '+%Y-%m-%d %H:%M:%S'))"
