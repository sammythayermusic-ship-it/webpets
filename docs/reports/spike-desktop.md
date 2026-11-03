# Spike — the tank on the desktop

Date: 2026-11-03. Your note after checkpoint F2: a square tank as a desktop widget, or the whole
tank as your desktop background. This spike put the existing bowl at desktop level in the installed
harness app to find out what macOS does with it, before any tank art is drawn.

## Answered
- **The level applies and holds.** With `layering {onDesktop:true}` the window reads back at the
  desktop icons' level minus one (−2147483604): above the wallpaper, below every window and below
  the desktop icons, which is where the live-wallpaper apps put theirs. The window list agrees, and
  it stayed there through Space switches and clicks elsewhere.
- **It renders normally there.** `spike-desktop/tank-at-desktop-level.png` is a capture of the
  window at that level: the live fish, the water, the glass, all as usual.
- **It looks like a widget already.** On the desktop it sits on the wallpaper among the macOS
  desktop widgets (your calendar and Claude widgets), with the desktop icons drawn over it. The
  full-screen captures that show this are on the Mac, not in the repo (they show your desktop).
- **It is on every desktop Space still.** One Space to the left, a desktop Space, showed the tank in
  place. One to the right was a full-screen app's Space, which never shows the pet, by design.
- **The pointer reaches it.** In the first run, moving the pointer over the tank brought up the bar
  and a hello ("Ah. A familiar face. Hello."), so the window sees the mouse at desktop level.

## Not answered: clicks
Whether a click on the tank feeds or knocks, and whether macOS's "click the wallpaper to show the
desktop" fires on it, is still open. Stage Manager is on on your Mac, and stepping through Spaces
put your Claude window onto the stage over the tank, so the scripted clicks went into that window
instead (one opened an artifact panel in another conversation; nothing was typed beyond Escape).
I stopped clicking at that point rather than keep poking at your windows.

It is one tray click for you to answer: **Visible on → On the desktop (behind windows)** in the
installed app, then click the fish and the glass, and click the wallpaper beside it. The same item
turns it off. It is off by default and nothing else changed.

## What's in the code
- `onDesktop` is a fourth layering flag end to end: Rust (`window.rs`, `commands.rs`, `tray.rs`),
  the platform, the settings file, the store, the tray and the harness (`layering` op). Default off.
- `tools/mac/spike_desktop.sh` is the test driver. It only runs while the Mac is idle, and puts
  the level, the Space, the cursor and the front app back when it ends.

## What a real Step H would need
1. **A square tank habitat** from Blender, with day, night, dawn and dusk plates like the bowl,
   rendered big enough for a Retina screen in wallpaper mode (the bowl's plates stop at 4× the
   grid), so the scale rule gets a "fill the screen" case.
2. **Two sizes of the same mode:** widget-sized at a pinned spot, or filling the display. One window
   per display, main display first.
3. **The rendering cost at full screen:** the live layer renders at window size, so a 3000-pixel
   tank is more GPU than a 600-pixel bowl. Measure in the built app; lower the live layer's
   resolution if the Mac warms up.
4. **Clicks**, once you have tried them: if "click the wallpaper" fires on the tank, the tank has to
   swallow the click itself (take the mouse only over the fish and the feeder, as it does now).
