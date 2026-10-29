//! Click-through hit testing.
//!
//! Why a Rust-side poller instead of `mousemove` in the webview:
//! macOS `NSWindow.ignoresMouseEvents` is all-or-nothing for the whole window. The transparent
//! padding around the habitat must be click-through, so the window has to ignore cursor events
//! whenever the cursor is over padding. But once the window ignores cursor events the webview gets
//! no `mousemove`/`mouseleave` at all, so it can never notice the cursor coming back over the
//! habitat (or leaving it) and could never flip the flag back. Hover state therefore has to come
//! from outside the webview.
//!
//! The workaround: the frontend sends the rectangles that should receive mouse events
//! (`set_hit_regions`, window-local CSS px). A plain `std::thread` polls the global cursor position
//! every `POINTER_POLL_MS`, converts it to window-local logical px, tests it against the regions,
//! calls `set_ignore_cursor_events(!inside)` only when the answer changes, and emits a `pointer`
//! event `{ inside, x, y }` on every inside/outside change plus at poll rate while inside so the
//! HUD can follow the cursor. With no regions registered yet nothing is ignored.
//!
//! Threading: `Window::set_ignore_cursor_events` does not need `run_on_main_thread`. In
//! tauri-runtime-wry the call is `send_user_message(...)`, which posts a `WindowMessage` to the
//! event loop proxy when invoked off the main thread (and tao's macOS implementation additionally
//! dispatches `setIgnoresMouseEvents` onto the main dispatch queue). The getters used here
//! (`cursor_position`, `outer_position`, `outer_size`, `scale_factor`) are synchronous round trips
//! to the event loop; they block this thread, never the UI.
//!
//! Coordinates: tao reports the cursor in physical px scaled by the *primary* monitor's scale
//! factor, while the window's outer position is scaled by the *window's* scale factor, so each is
//! converted to logical px with its own factor before subtracting. On a single monitor this is
//! exactly `(cursor - outer_position) / scale_factor`.

use std::sync::atomic::Ordering;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::state::ShellState;
use crate::window::MAIN_WINDOW;

/// Contract `POINTER_POLL_MS`.
pub const POINTER_POLL_MS: u64 = 50;
/// Re-read the primary monitor's scale factor every this many polls (~1 s).
const PRIMARY_SF_REFRESH_POLLS: u32 = 20;
/// Check every this many polls (~0.5 s) whether the window is on the active Space but counted as
/// occluded, and re-order it front if so. See `window::nudge_occluded`.
const OCCLUSION_CHECK_POLLS: u32 = 10;

/// Mirrors `PointerState` in `src/platform/types.ts`.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct PointerState {
    pub inside: bool,
    pub x: f64,
    pub y: f64,
}

fn emit_pointer(app: &AppHandle, state: PointerState) {
    if let Err(e) = app.emit("pointer", state) {
        eprintln!("[webpets] failed to emit pointer: {e}");
    }
}

pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        let mut primary_sf = 1.0;
        let mut polls: u32 = 0;
        loop {
            thread::sleep(Duration::from_millis(POINTER_POLL_MS));
            polls = polls.wrapping_add(1);
            let state = app.state::<ShellState>();

            if !state.visible.load(Ordering::SeqCst) {
                // Hidden: nothing to hit-test, but let the frontend know the pointer is gone.
                if state.pointer_inside.swap(false, Ordering::SeqCst) {
                    emit_pointer(&app, PointerState { inside: false, x: 0.0, y: 0.0 });
                }
                continue;
            }

            let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
                continue;
            };

            // While the webview owns the pointer -- a resize drag in flight -- nothing below may run.
            // Toggling ignore-cursor-events mid-drag takes the pointer away from the element that
            // captured it, and the drag dies halfway with the window stuck at whatever size it reached.
            let locked = state
                .interaction_lock_until
                .lock()
                .ok()
                .and_then(|g| *g)
                .is_some_and(|t| Instant::now() < t);
            if locked {
                if state.ignoring.swap(false, Ordering::SeqCst) {
                    if let Err(e) = window.set_ignore_cursor_events(false) {
                        eprintln!("[webpets] set_ignore_cursor_events(false) failed: {e}");
                    }
                }
                continue;
            }
            if polls % PRIMARY_SF_REFRESH_POLLS == 1 {
                if let Ok(Some(m)) = app.primary_monitor() {
                    primary_sf = m.scale_factor();
                }
            }
            if polls % OCCLUSION_CHECK_POLLS == 3 {
                match crate::window::nudge_occluded(&app) {
                    Ok(true) => eprintln!("[webpets] window was on the active Space but counted occluded; re-ordered it front"),
                    Ok(false) => {}
                    Err(e) => eprintln!("[webpets] occlusion check failed: {e}"),
                }
            }
            let (Ok(cursor), Ok(pos), Ok(size), Ok(sf)) = (
                app.cursor_position(),
                window.outer_position(),
                window.outer_size(),
                window.scale_factor(),
            ) else {
                continue;
            };

            let x = cursor.x / primary_sf - f64::from(pos.x) / sf;
            let y = cursor.y / primary_sf - f64::from(pos.y) / sf;
            let w = f64::from(size.width) / sf;
            let h = f64::from(size.height) / sf;
            let in_window = x >= 0.0 && y >= 0.0 && x < w && y < h;

            let regions = state
                .regions
                .lock()
                .map(|r| r.clone())
                .unwrap_or_default();
            let inside = in_window && (regions.is_empty() || regions.iter().any(|r| r.contains(x, y)));
            let ignore = !regions.is_empty() && !inside;

            if state.ignoring.swap(ignore, Ordering::SeqCst) != ignore {
                if let Err(e) = window.set_ignore_cursor_events(ignore) {
                    eprintln!("[webpets] set_ignore_cursor_events({ignore}) failed: {e}");
                }
            }

            let was_inside = state.pointer_inside.swap(inside, Ordering::SeqCst);
            if inside || was_inside != inside {
                emit_pointer(
                    &app,
                    PointerState {
                        inside,
                        x: x.round(),
                        y: y.round(),
                    },
                );
            }
        }
    });
}
