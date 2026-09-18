//! Process-wide shell state shared by commands, the cursor poller and the window event handlers.

use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::PhysicalPosition;

use crate::tray::TrayMenu;

/// Axis-aligned rectangle in window-local CSS (logical) px. Mirrors `Rect` in `src/sim/types.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl HitRect {
    pub fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && y >= self.y && x < self.x + self.w && y < self.y + self.h
    }
}

#[derive(Default)]
pub struct ShellState {
    /// While set and in the future, the webview owns the pointer and the cursor poller stands down.
    ///
    /// A DEADLINE rather than a flag, and renewed as the interaction continues, because the release is
    /// the dangerous half: if a pointerup is swallowed -- Mission Control, a Space switch, a crash --
    /// a boolean would leave the transparent padding permanently opaque and the user unable to click
    /// their own desktop again. A stale deadline expires on its own.
    pub interaction_lock_until: Mutex<Option<Instant>>,

    /// Regions that must receive mouse events; everything else is click-through. Empty = not ignoring.
    pub regions: Mutex<Vec<HitRect>>,
    /// Last value passed to `set_ignore_cursor_events`.
    pub ignoring: AtomicBool,
    /// Last `inside` value emitted with the `pointer` event.
    pub pointer_inside: AtomicBool,
    /// True once `set_scale` has performed its first-call position restore.
    pub position_restored: AtomicBool,
    /// True once anything (TS, the single-instance callback or the safety timer) has shown the window.
    pub shown: AtomicBool,
    /// Rust's view of the window visibility (`show_window` / `hide_window`).
    pub visible: AtomicBool,
    /// Time of the latest `WindowEvent::Moved` that was not self-inflicted.
    pub last_moved: Mutex<Option<Instant>>,
    /// True while a settle thread is waiting for the move to stop.
    pub settle_pending: AtomicBool,
    /// Physical position Rust itself last set; a `Moved` event landing there is ignored.
    pub self_set_position: Mutex<Option<PhysicalPosition<i32>>>,
    /// `Moved` events before this instant are ignored (programmatic resize/reposition in flight).
    pub suppress_moved_until: Mutex<Option<Instant>>,
    /// Handles to the tray menu items so `tray_set_menu_state` can update them.
    pub tray: Mutex<Option<TrayMenu>>,
}
