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

Update 2026-10-30 (Step A): the candidates' build folders are gone, and the A and B worktrees are
retired, but the disk is still at 97% (about 15 GB free). What is left that only you should delete:
- **Empty the Trash** (or just the two folders `webpets-bakeoff-a-rendered-worktree` and
  `webpets-bakeoff-b-live3d-worktree` in it): 710 MB. I moved them there instead of deleting them
  because a permanent delete is your call; both branches are safe on GitHub.
- `~/Desktop/webpets/src-tauri/target` in your own checkout: 5.4 GB of build cache from September.
  Builds now happen in the session worktree, so nothing needs it; it rebuilds itself if ever needed.
- The worktrees `.claude/worktrees/bakeoff-c-hybrid` (330 MB; C is merged into `main`) and
  `.claude/worktrees/affectionate-joliot-270fc2` (860 MB; a September branch with one unmerged
  commit about the bowl's waterline, done again on `main` by `9df5ba7` and re-rendered since). Say the
  word and I retire them the same way.
- `WebPets A.app`, `WebPets B.app` and `WebPets C.app` in Applications (about 100 MB together) stay
  until you say to remove them.


### Update, Step B (2026-10-30, evening): eviction is now hitting source files
Twice during Step B macOS evicted files from the working folder while I was using them: 3,300 build
files, then ~200 sources (`src/sim`, the sprite frames, the Blender scene). Tests then time out
reading them and look like failures. I re-download and carry on, and I moved the Rust build cache
out of iCloud (`~/.cache/webpets/target`, about 3 GB), but the repo itself is still on the iCloud
Desktop with ~13 GB free. Moving it (or turning off "Optimize Mac Storage") is the one fix; emptying
the Trash and deleting `~/Desktop/webpets/src-tauri/target` (5.4 GB) would buy time.

### Bubbles died on Oct 29 (2026-10-30) — nothing blocked
Your pet in `WebPets.app` ran out of food while the app was not running (the clock never stops),
and died about a day before the Step A build was installed. The app is showing the "While you were
gone" card. I left it: acknowledging a death and adopting a new pet are yours. Checkpoint evidence
comes from the separate harness app, which has its own pet.

### Google Drive may be backing up the build cache (2026-10-30) — slows builds, nothing blocked
During the Step A captures, Google Drive's window was trying to upload this project's build
files (`lib-thiserror`, `dep-lib-thiserror`, `invoked.timestamp`), with 264 errors. If Drive backs
up your Desktop, it is backing up every `src-tauri/target` and `node_modules` under it: tens of
thousands of files that change on every build. Moving the repo off the Desktop (see the item
above) fixes this as well. Otherwise, take the Desktop out of Drive's backup.

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

### Claude-written lines for everyone, not just you (2026-10-31) — nothing blocked
Regular users will not have an Anthropic API key, so for them the fresh lines (and later chat,
sports and news in the pet's voice) need a small server that holds the key and keeps a cap per
pet. That costs money per user, which ties into how the app makes money. Until you decide, the
built-in library carries the personality on its own, and Claude-written lines work on your Mac with
your own key (adding it is the item below).

### Kids using it (2026-10-31) — nothing blocked
If children use WebPets: Anthropic's usage policy has extra requirements for products minors use,
and in the US, COPPA applies to anything collected from under-13s. Everything the pet knows about
you stays on the Mac, which helps. Worth deciding before launch: the age rating, and whether
chatting with the pet through Claude is on for kids or only the built-in lines.

## Open questions from the brief (not blocking; code keeps both options open)
- How the app makes money.
- ~~Whether food costs anything.~~ Answered 2026-10-31: food is free, no $FEED.
- Whether a pet can die for good. (Today it can, if it goes a day and a half unfed with an empty
  feeder. With kids in mind you may want a gentler version, e.g. it gets sick and recovers.)
