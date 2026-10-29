# Needs Sammy

Things only you can do, or that cannot be undone, or that cost money. Each entry says what is blocked
by it. Everything else keeps moving without it.

## Open now

### The repo lives in iCloud Drive and the disk is nearly full (2026-10-28) — blocks builds
`~/Desktop` is synced to iCloud Drive with "Optimize Mac Storage" on, and the disk was at 96% (20 GB
free). macOS responded by evicting about two thirds of the files in every WebPets worktree — sources,
assets, node_modules, cargo targets — to placeholder "dataless" files. Reading one then blocks on a
network fetch (seconds per file), so `tsc`, `vitest` and `cargo` sat at 1% CPU for ten minutes, and
the bake-off builders were cut off waiting. I re-downloaded the worktrees' sources with `brctl
download` and cleared the regenerable npm cache (5 GB), but eviction will happen again while the
repo is under iCloud and the disk is this full. Your call, any of:
- move the repo out of iCloud (e.g. `~/Code/webpets`; the Claude session folders would need
  re-opening at the new path), or
- turn off "Optimize Mac Storage" in System Settings > Apple Account > iCloud Drive, or
- free a good chunk of disk (the candidate worktrees' `src-tauri/target` folders are ~5 GB and can be
  deleted once the bake-off is decided; I will do that myself).
Until then I keep working and re-download as needed; builds are just slower and occasionally stall.


### macOS screen-recording consent for the Claude desktop app (2026-10-28)
While the health check was capturing the pet window, macOS put up a dialog: "Claude is requesting to
bypass the system private window picker and directly access your screen and audio" (Allow / Open
System Settings). I did not touch it: it is a system permission prompt and that choice is yours.
Captures are still working for now (macOS re-asks periodically), so nothing is blocked today. If
captures start coming back black, that dialog is why. Dismiss it or allow it; either is fine for the
project.

### Later, when Step 6 (iPhone) starts
- Apple Developer account, signing identity and provisioning for the iPhone app and widgets.
- Testing on your actual iPhone.
- Notarization of the Mac build before anyone else installs it.

## Open questions from the brief (not blocking; code keeps both options open)
- How the app makes money.
- Whether food costs anything.
- Whether a pet can die for good.
