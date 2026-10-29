//! Window geometry: scale-based sizing, per-monitor position restore/persist, edge snapping,
//! move settling and the 10 s safety show. All math is done in logical (CSS) px; every physical
//! value is converted with the scale factor of the thing it belongs to (window or monitor) because
//! tao's macOS backend computes physical coordinates as `logical * that_object's_scale_factor`.

use std::sync::atomic::Ordering;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Map, Value};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Monitor, PhysicalPosition,
    WebviewWindow, Wry,
};
use tauri_plugin_store::StoreExt;

#[cfg(target_os = "macos")]
use objc2_app_kit::{NSNormalWindowLevel, NSStatusWindowLevel, NSWindow, NSWindowCollectionBehavior, NSWindowOcclusionState};

use crate::state::ShellState;

pub const MAIN_WINDOW: &str = "main";

/// Habitat grid and padding (contract: `GRID_W`, `GRID_H`, `WINDOW_PAD` in `src/sim/constants.ts`).
const GRID_W: f64 = 320.0;
const GRID_H: f64 = 240.0;
const WINDOW_PAD: f64 = 24.0;
/// The scale is an integer count of EIGHTHS of the grid (contract: `SCALE_STEPS_PER_UNIT` in
/// `src/sim/constants.ts`). `GRID_W` and `GRID_H` are both divisible by it, so every window size comes
/// out a whole number of pixels in both languages with no rounding rule to keep in step — which is the
/// point, because a one-pixel disagreement silently stops the click-through region matching the art.
const SCALE_STEPS_PER_UNIT: f64 = 8.0;
/// The named rungs the tray's Size menu offers (contract: `SCALE_S`/`SCALE_M`/`SCALE_L`). `tray.rs`
/// checks its menu against these rather than against bare numbers.
pub const SCALE_S: u8 = 6;
pub const SCALE_M: u8 = 16;
pub const SCALE_L: u8 = 24;
/// Lowest and highest scale accepted by `set_scale` (contract: `MIN_SCALE`/`MAX_SCALE`). 0.5x to 4x;
/// the ceiling is where the habitat is drawn 1:1 with the resolution its art was rendered at.
const MIN_SCALE: u8 = 4;
const MAX_SCALE: u8 = 32;
/// Snap to a work-area edge when within this many logical px (contract `SNAP_PX`).
const SNAP_PX: f64 = 16.0;
/// Default distance from the bottom-right corner of the primary work area on first launch.
const DEFAULT_MARGIN: f64 = 24.0;
/// A move is "settled" once no `Moved` event arrived for this long.
const MOVE_SETTLE_MS: u64 = 150;
/// `Moved` events within this window after a programmatic resize/reposition are ignored.
const SELF_MOVE_SUPPRESS_MS: u64 = 250;
/// If TS never calls `show_window` (frontend crash), show the window anyway after this long.
const SAFETY_SHOW_MS: u64 = 10_000;

const SETTINGS_FILE: &str = "settings.json";
/// The key the frontend writes its whole settings document under. Rust reads the layering flags out
/// of it at startup; it owns only `positions` beside it.
const SETTINGS_DOC_KEY: &str = "doc";
/// Top-level key in settings.json owned by Rust. TS only ever writes the key `doc`.
const POSITIONS_KEY: &str = "positions";
/// Entry inside `positions` holding the monitor key that was persisted most recently. Monitor keys
/// always contain `@`, so this name can never collide with one.
const LAST_KEY: &str = "last";

/// Mirrors `WindowGeometry` in `src/platform/types.ts`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometry {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale_factor: f64,
    pub monitor_key: String,
}

/// Logical rectangle (CSS px, global screen coordinates).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl LRect {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && y >= self.y && x < self.x + self.w && y < self.y + self.h
    }
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Whether `set_scale` accepts this scale (contract: `MIN_SCALE`/`MAX_SCALE` in `src/sim/constants.ts`).
pub fn scale_supported(scale: u8) -> bool {
    (MIN_SCALE..=MAX_SCALE).contains(&scale)
}

/// Window size for a scale in eighths: `(40n + 48) x (30n + 48)` — S 288x228, M 688x528, L 1008x768.
/// Mirrors `windowSizeForScale` in
/// `src/sim/constants.ts`; `contract_sync` below fails the build if the two drift apart.
pub fn window_size_for_scale(scale: u8) -> (f64, f64) {
    let s = f64::from(scale);
    (
        GRID_W * s / SCALE_STEPS_PER_UNIT + 2.0 * WINDOW_PAD,
        GRID_H * s / SCALE_STEPS_PER_UNIT + 2.0 * WINDOW_PAD,
    )
}

/// Whether the window at `scale` fits inside the work area of the monitor the window is currently on.
///
/// The tray greys out a size that would not fit: L is 1008x768, which is comfortable on a 1512x982
/// display and obnoxious on a 1440x900 one for a window that is always on top. `snap_and_clamp`
/// already keeps an oversized window on screen, so this is about taste, not correctness — which is
/// why every failure to read the monitor answers "it fits". Refusing to offer a size the user could
/// actually use is the worse error.
pub fn scale_fits_work_area(app: &AppHandle, scale: u8) -> bool {
    let Ok(window) = main_window(app) else {
        return true;
    };
    let Ok((rect, _)) = outer_rect(&window) else {
        return true;
    };
    let Some(monitor) = monitor_for(app, &window, &rect) else {
        return true;
    };
    let area = work_area(&monitor);
    let (w, h) = window_size_for_scale(scale);
    w <= area.w && h <= area.h
}

pub fn main_window(app: &AppHandle) -> Result<WebviewWindow<Wry>, String> {
    app.get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| "main window not found".to_string())
}

/// `"<name or 'unknown'>@<w>x<h>"` using the monitor's logical size.
pub fn monitor_key(monitor: &Monitor) -> String {
    let sf = monitor.scale_factor();
    let w = (f64::from(monitor.size().width) / sf).round();
    let h = (f64::from(monitor.size().height) / sf).round();
    let name = monitor
        .name()
        .map(|n| n.as_str())
        .filter(|n| !n.is_empty())
        .unwrap_or("unknown");
    format!("{name}@{w}x{h}")
}

/// Work area of a monitor in logical px.
pub fn work_area(monitor: &Monitor) -> LRect {
    let sf = monitor.scale_factor();
    let wa = monitor.work_area();
    LRect {
        x: f64::from(wa.position.x) / sf,
        y: f64::from(wa.position.y) / sf,
        w: f64::from(wa.size.width) / sf,
        h: f64::from(wa.size.height) / sf,
    }
}

/// Full bounds of a monitor in logical px.
fn monitor_bounds(monitor: &Monitor) -> LRect {
    let sf = monitor.scale_factor();
    LRect {
        x: f64::from(monitor.position().x) / sf,
        y: f64::from(monitor.position().y) / sf,
        w: f64::from(monitor.size().width) / sf,
        h: f64::from(monitor.size().height) / sf,
    }
}

/// Outer rectangle of the window in logical px plus the window's scale factor.
fn outer_rect(window: &WebviewWindow<Wry>) -> Result<(LRect, f64), String> {
    let sf = window.scale_factor().map_err(err)?;
    let pos = window.outer_position().map_err(err)?;
    let size = window.outer_size().map_err(err)?;
    Ok((
        LRect {
            x: f64::from(pos.x) / sf,
            y: f64::from(pos.y) / sf,
            w: f64::from(size.width) / sf,
            h: f64::from(size.height) / sf,
        },
        sf,
    ))
}

fn primary_or_first(app: &AppHandle) -> Option<Monitor> {
    app.primary_monitor()
        .ok()
        .flatten()
        .or_else(|| app.available_monitors().ok().and_then(|m| m.into_iter().next()))
}

/// The monitor a window rect belongs to: the window's own report, else the monitor containing the
/// rect's center, else the primary.
fn monitor_for(app: &AppHandle, window: &WebviewWindow<Wry>, rect: &LRect) -> Option<Monitor> {
    if let Ok(Some(m)) = window.current_monitor() {
        return Some(m);
    }
    let cx = rect.x + rect.w / 2.0;
    let cy = rect.y + rect.h / 2.0;
    if let Ok(monitors) = app.available_monitors() {
        if let Some(m) = monitors
            .into_iter()
            .find(|m| monitor_bounds(m).contains(cx, cy))
        {
            return Some(m);
        }
    }
    primary_or_first(app)
}

/// Snap `rect` to the edges of `area` when within `SNAP_PX`, then clamp it inside `area`.
/// Returns the new top-left corner (rounded to whole logical px).
/// Keeps a rect inside the work area without snapping it to an edge.
pub fn clamp_only(rect: LRect, area: LRect) -> (f64, f64) {
    let max_x = area.x + area.w - rect.w;
    let max_y = area.y + area.h - rect.h;
    let x = if max_x < area.x { area.x } else { rect.x.clamp(area.x, max_x) };
    let y = if max_y < area.y { area.y } else { rect.y.clamp(area.y, max_y) };
    (x.round(), y.round())
}

pub fn snap_and_clamp(rect: LRect, area: LRect) -> (f64, f64) {
    let mut x = rect.x;
    let mut y = rect.y;
    let right = area.x + area.w;
    let bottom = area.y + area.h;

    if (x - area.x).abs() <= SNAP_PX {
        x = area.x;
    } else if (x + rect.w - right).abs() <= SNAP_PX {
        x = right - rect.w;
    }
    if (y - area.y).abs() <= SNAP_PX {
        y = area.y;
    } else if (y + rect.h - bottom).abs() <= SNAP_PX {
        y = bottom - rect.h;
    }

    let max_x = right - rect.w;
    let max_y = bottom - rect.h;
    x = if max_x < area.x { area.x } else { x.clamp(area.x, max_x) };
    y = if max_y < area.y { area.y } else { y.clamp(area.y, max_y) };
    (x.round(), y.round())
}

fn positions_store(app: &AppHandle) -> Option<std::sync::Arc<tauri_plugin_store::Store<Wry>>> {
    match app.store(SETTINGS_FILE) {
        Ok(store) => Some(store),
        Err(e) => {
            eprintln!("[webpets] settings store unavailable: {e}");
            None
        }
    }
}

fn read_positions(app: &AppHandle) -> Map<String, Value> {
    positions_store(app)
        .and_then(|store| store.get(POSITIONS_KEY))
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

/// Writes `positions[key] = {x, y}` and `positions.last = key`, keeping every other key of
/// settings.json (including `doc`) intact.
fn persist_position(app: &AppHandle, key: &str, x: f64, y: f64) {
    let Some(store) = positions_store(app) else {
        return;
    };
    let mut positions = store
        .get(POSITIONS_KEY)
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();
    positions.insert(key.to_string(), json!({ "x": x, "y": y }));
    positions.insert(LAST_KEY.to_string(), Value::String(key.to_string()));
    store.set(POSITIONS_KEY, Value::Object(positions));
    if let Err(e) = store.save() {
        eprintln!("[webpets] failed to save window position: {e}");
    }
}

fn saved_position(positions: &Map<String, Value>, key: &str) -> Option<(f64, f64)> {
    let entry = positions.get(key)?.as_object()?;
    Some((entry.get("x")?.as_f64()?, entry.get("y")?.as_f64()?))
}

/// Picks which saved position to restore on first launch. `keys` are the connected monitors' keys
/// in preference order (the window's current monitor first). The monitor recorded in
/// `positions.last` wins when it is connected and has an entry; otherwise the first key in order
/// with a saved entry. Returns the index into `keys` and the saved top-left.
fn pick_restore(positions: &Map<String, Value>, keys: &[String]) -> Option<(usize, (f64, f64))> {
    let last = positions.get(LAST_KEY).and_then(Value::as_str);
    if let Some(last) = last {
        if let Some(i) = keys.iter().position(|k| k == last) {
            if let Some(p) = saved_position(positions, last) {
                return Some((i, p));
            }
        }
    }
    keys.iter()
        .enumerate()
        .find_map(|(i, k)| saved_position(positions, k).map(|p| (i, p)))
}

/// Marks a programmatic geometry change so the resulting `Moved` events are ignored, then applies it.
fn apply_geometry(
    app: &AppHandle,
    window: &WebviewWindow<Wry>,
    sf: f64,
    x: f64,
    y: f64,
    size: Option<(f64, f64)>,
) -> Result<(), String> {
    let state = app.state::<ShellState>();
    let expected = PhysicalPosition::new((x * sf).round() as i32, (y * sf).round() as i32);
    if let Ok(mut guard) = state.self_set_position.lock() {
        *guard = Some(expected);
    }
    if let Ok(mut guard) = state.suppress_moved_until.lock() {
        *guard = Some(Instant::now() + Duration::from_millis(SELF_MOVE_SUPPRESS_MS));
    }
    if let Some((w, h)) = size {
        window.set_size(LogicalSize::new(w, h)).map_err(err)?;
    }
    window.set_position(LogicalPosition::new(x, y)).map_err(err)?;
    Ok(())
}

/// `set_scale`: resize to `(320s+48, 240s+48)` keeping the bottom-right corner fixed. The first call
/// after launch instead restores `positions[monitorKey]` (preferring the monitor recorded in
/// `positions.last` when it is connected, then the monitor the window is on, then any other
/// connected monitor with a saved position) or defaults to the bottom-right corner of the primary
/// work area with a 24 px margin. The result is clamped to the work area and persisted.
pub fn set_scale(app: &AppHandle, scale: u8) -> Result<WindowGeometry, String> {
    set_scale_inner(app, scale, false)
}

/// `live` means a resize drag is in flight: skip the edge snapping, which would yank the window out
/// from under the cursor, and skip persisting, which writes to disk. Both happen once on release.
pub fn set_scale_live(app: &AppHandle, scale: u8, live: bool) -> Result<WindowGeometry, String> {
    set_scale_inner(app, scale, live)
}

fn set_scale_inner(app: &AppHandle, scale: u8, live: bool) -> Result<WindowGeometry, String> {
    if !scale_supported(scale) {
        return Err(format!(
            "invalid scale {scale}; expected {MIN_SCALE}..={MAX_SCALE} eighths of the grid"
        ));
    }
    let window = main_window(app)?;
    let (cur, sf) = outer_rect(&window)?;
    let (w, h) = window_size_for_scale(scale);
    let state = app.state::<ShellState>();
    let first = !state.position_restored.swap(true, Ordering::SeqCst);

    let (monitor, x, y) = if first {
        let positions = read_positions(app);
        let mut candidates: Vec<Monitor> = Vec::new();
        if let Some(m) = monitor_for(app, &window, &cur) {
            candidates.push(m);
        }
        if let Ok(all) = app.available_monitors() {
            for m in all {
                if !candidates.iter().any(|c| monitor_key(c) == monitor_key(&m)) {
                    candidates.push(m);
                }
            }
        }
        let keys: Vec<String> = candidates.iter().map(monitor_key).collect();
        match pick_restore(&positions, &keys) {
            Some((i, (x, y))) => (Some(candidates[i].clone()), x, y),
            None => {
                let m = primary_or_first(app);
                match &m {
                    Some(mon) => {
                        let wa = work_area(mon);
                        (
                            m.clone(),
                            wa.x + wa.w - DEFAULT_MARGIN - w,
                            wa.y + wa.h - DEFAULT_MARGIN - h,
                        )
                    }
                    None => (None, cur.x, cur.y),
                }
            }
        }
    } else {
        let m = monitor_for(app, &window, &cur);
        (m, cur.x + cur.w - w, cur.y + cur.h - h)
    };

    let (x, y, key) = match &monitor {
        Some(m) => {
            let r = LRect { x, y, w, h };
            let area = work_area(m);
            // Clamp, but do not snap, while dragging: snapping moves the window by up to SNAP_PX,
            // which detaches the handle from the cursor mid-drag.
            let (x, y) = if live { clamp_only(r, area) } else { snap_and_clamp(r, area) };
            (x, y, monitor_key(m))
        }
        None => (x.round(), y.round(), "unknown@0x0".to_string()),
    };

    apply_geometry(app, &window, sf, x, y, Some((w, h)))?;
    // A live drag writes nothing: persist_position calls store.save(), and a drag produces a step
    // every few pixels of travel.
    if monitor.is_some() && !live {
        persist_position(app, &key, x, y);
    }
    Ok(WindowGeometry {
        x,
        y,
        width: w,
        height: h,
        scale_factor: sf,
        monitor_key: key,
    })
}

pub fn current_geometry(app: &AppHandle) -> Result<WindowGeometry, String> {
    let window = main_window(app)?;
    let (rect, sf) = outer_rect(&window)?;
    let key = monitor_for(app, &window, &rect)
        .map(|m| monitor_key(&m))
        .unwrap_or_else(|| "unknown@0x0".to_string());
    Ok(WindowGeometry {
        x: rect.x.round(),
        y: rect.y.round(),
        width: rect.w.round(),
        height: rect.h.round(),
        scale_factor: sf,
        monitor_key: key,
    })
}

/// `WindowEvent::Moved` handler. Ignores self-inflicted moves, records the time and starts (at most
/// one) settle thread that waits for `MOVE_SETTLE_MS` of silence before snapping and persisting.
pub fn on_moved(app: &AppHandle, position: PhysicalPosition<i32>) {
    let state = app.state::<ShellState>();
    if let Ok(guard) = state.suppress_moved_until.lock() {
        if guard.is_some_and(|until| Instant::now() < until) {
            return;
        }
    }
    if let Ok(guard) = state.self_set_position.lock() {
        if guard.is_some_and(|p| (p.x - position.x).abs() <= 1 && (p.y - position.y).abs() <= 1) {
            return;
        }
    }
    if let Ok(mut guard) = state.last_moved.lock() {
        *guard = Some(Instant::now());
    }
    if state.settle_pending.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    thread::spawn(move || {
        let settle = Duration::from_millis(MOVE_SETTLE_MS);
        loop {
            thread::sleep(settle);
            let last = app
                .state::<ShellState>()
                .last_moved
                .lock()
                .ok()
                .and_then(|g| *g);
            match last {
                Some(t) if t.elapsed() < settle => continue,
                _ => break,
            }
        }
        app.state::<ShellState>()
            .settle_pending
            .store(false, Ordering::SeqCst);
        if let Err(e) = settle_position(&app) {
            eprintln!("[webpets] settle after move failed: {e}");
        }
    });
}

/// Snap to the work-area edges, clamp, reposition only if different, persist and emit `window-moved`.
fn settle_position(app: &AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
    let (cur, sf) = outer_rect(&window)?;
    let Some(monitor) = monitor_for(app, &window, &cur) else {
        return Ok(());
    };
    let (x, y) = snap_and_clamp(cur, work_area(&monitor));
    if (x - cur.x).abs() >= 0.5 || (y - cur.y).abs() >= 0.5 {
        apply_geometry(app, &window, sf, x, y, None)?;
    }
    let key = monitor_key(&monitor);
    persist_position(app, &key, x, y);
    let geometry = WindowGeometry {
        x,
        y,
        width: cur.w.round(),
        height: cur.h.round(),
        scale_factor: sf,
        monitor_key: key,
    };
    app.emit("window-moved", geometry).map_err(err)
}

/// How the habitat window sits relative to other windows, desktops and fullscreen apps.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Layering {
    pub always_on_top: bool,
    pub all_desktops: bool,
    pub over_fullscreen: bool,
}

impl Default for Layering {
    /// What the app did unconditionally before any of this was a setting.
    fn default() -> Self {
        Self { always_on_top: true, all_desktops: true, over_fullscreen: true }
    }
}

/// Reads the layering flags the frontend persisted, falling back to the defaults.
///
/// Rust reads them so that startup can apply them itself, before the window is ever shown and without
/// depending on the frontend booting at all. That guarantee is the whole point: when it lived only in
/// a frontend call, a failure anywhere earlier in boot left the window with no collection behaviour
/// and nothing said so.
pub fn layering_from_settings(app: &AppHandle) -> Layering {
    let d = Layering::default();
    let Some(store) = positions_store(app) else { return d };
    let Some(doc) = store.get(SETTINGS_DOC_KEY) else { return d };
    let flag = |name: &str, fallback: bool| doc.get(name).and_then(Value::as_bool).unwrap_or(fallback);
    Layering {
        always_on_top: flag("alwaysOnTop", d.always_on_top),
        all_desktops: flag("allDesktops", d.all_desktops),
        over_fullscreen: flag("overFullscreen", d.over_fullscreen),
    }
}

/// Applies all three layering flags together.
///
/// Together, and in one native block, because on macOS they are facets of two properties of the same
/// window — its level and its collection behavior — and the collection behavior is a bitmask that has
/// to be read, modified and written. Doing them separately meant the level went through the window
/// runtime (which defers to the main thread) while the bitmask was poked directly from whatever thread
/// the command arrived on, so the ordering between them was accidental. It also meant a failure in the
/// last of three left the first two applied and returned a blanket error.
pub fn set_layering(app: &AppHandle, layering: Layering) -> Result<(), String> {
    let window = main_window(app)?;
    apply_layering(&window, layering)
}

#[cfg(target_os = "macos")]
fn apply_layering(window: &WebviewWindow<Wry>, layering: Layering) -> Result<(), String> {
    // `-[NSWindow setLevel:]` and `-[NSWindow setCollectionBehavior:]` are main-thread-only. The
    // window handle is fetched INSIDE the closure rather than captured: a raw pointer is not `Send`,
    // and a window handle fetched on another thread is not something to smuggle across one anyway.
    let handle = window.clone();
    // The result is carried back rather than assumed. `run_on_main_thread` queues the closure and
    // returns as soon as it is queued, so the old version reported success the instant the work was
    // SCHEDULED -- and if fetching the window handle then failed inside the closure it returned
    // silently, leaving the frontend to persist the setting as applied. A layering toggle that says
    // it is on while the window has none of the flags is the exact failure this whole area already
    // cost an evening to. `layering_readback` below has always waited on a channel; so does this now.
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    window
        .run_on_main_thread(move || {
            let ptr = match handle.ns_window() {
                Ok(ptr) => ptr,
                Err(e) => {
                    let _ = tx.send(Err(format!("no native window handle: {e}")));
                    return;
                }
            };
            // SAFETY: `ns_window` hands back this window's live NSWindow, on the thread that owns it.
            // Tauri guarantees the window outlives the handle it came from, this borrows it only for
            // the call, and nothing retains it.
            unsafe {
                let ns: &NSWindow = &*ptr.cast::<NSWindow>();
                // Status level, not floating. "Above every window" has to mean above other apps'
                // floating panels too — a picture-in-picture video, a palette, a HUD — and floating
                // level only clears ordinary windows. Being above the menu bar's level is harmless
                // here because the window is always clamped into the monitor's WORK area, which
                // excludes the menu bar, so it can never actually sit over it.
                ns.setLevel(if layering.always_on_top { NSStatusWindowLevel } else { NSNormalWindowLevel });

                let mut behavior = ns.collectionBehavior();
                behavior.set(NSWindowCollectionBehavior::CanJoinAllSpaces, layering.all_desktops);
                behavior.set(NSWindowCollectionBehavior::FullScreenAuxiliary, layering.over_fullscreen);
                // Stationary is the flag that says this window is not part of the managed window
                // layout: Mission Control and Stage Manager leave it where it is instead of shuffling
                // it about like an app window. Without it a pet on a Mac with Stage Manager on gets
                // treated as an ordinary window and pushed behind whatever has focus, which is the
                // symptom that looks like "always on top isn't working" but is not about the level.
                behavior.set(NSWindowCollectionBehavior::Stationary, layering.all_desktops);
                // The two halves of that pair are mutually exclusive per AppKit; asking for both
                // raises. Clearing Managed is what lets Stationary take effect.
                if layering.all_desktops {
                    behavior.remove(NSWindowCollectionBehavior::Managed);
                }
                ns.setCollectionBehavior(behavior);
            }
            let _ = tx.send(Ok(()));
        })
        .map_err(err)?;
    // A timeout rather than a bare `recv`: this is called during setup and from a command, and a
    // main thread that never drains its queue must surface as an error instead of wedging the caller.
    rx.recv_timeout(std::time::Duration::from_millis(500))
        .map_err(|e| format!("applying layering timed out: {e}"))?
}

#[cfg(not(target_os = "macos"))]
fn apply_layering(_window: &WebviewWindow<Wry>, _layering: Layering) -> Result<(), String> {
    Ok(())
}

/// The window's level and collection-behavior bits, read back off the live window.
///
/// For the boot report. The failure this exists to catch was invisible: the window config floats the
/// window at creation whatever else happens, so "always on top" kept looking like it worked while the
/// collection behavior was silently never applied. Reporting what was intended would have caught
/// nothing; this reports what the window actually has.
#[cfg(target_os = "macos")]
pub fn layering_readback(app: &AppHandle) -> Result<(i64, u64), String> {
    let window = main_window(app)?;
    let handle = window.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    window
        .run_on_main_thread(move || {
            let Ok(ptr) = handle.ns_window() else { return };
            // SAFETY: as in `apply_layering`.
            let out = unsafe {
                let ns: &NSWindow = &*ptr.cast::<NSWindow>();
                (ns.level() as i64, ns.collectionBehavior().bits() as u64)
            };
            let _ = tx.send(out);
        })
        .map_err(err)?;
    rx.recv_timeout(std::time::Duration::from_millis(500))
        .map_err(|e| format!("layering read-back timed out: {e}"))
}

#[cfg(not(target_os = "macos"))]
pub fn layering_readback(_app: &AppHandle) -> Result<(i64, u64), String> {
    Ok((0, 0))
}


/// Re-orders the window front if it is on the active Space but the window server does not count it
/// as visible. Called from the cursor poller every half second while the window is shown.
///
/// Why this exists: a window shown while a *fullscreen* Space is active (a pet launched at login
/// behind a fullscreen app, or a build started from a fullscreen terminal) is on every Space by its
/// collection behaviour, yet when the user switches to a desktop Space it comes on screen with the
/// window server still reporting it occluded. WebKit reads that occlusion state, keeps the document
/// `hidden`, stops `requestAnimationFrame` and clamps timers — the 15 fps case from checkpoint 0 —
/// and nothing in the app ever shows the window again to make it re-evaluate. Ordering it front
/// once it is actually on the active Space is that nudge. `orderFrontRegardless` because the app is
/// an Accessory and must not activate.
///
/// Returns whether a nudge happened, so the caller can log it exactly once per occurrence.
#[cfg(target_os = "macos")]
pub fn nudge_occluded(app: &AppHandle) -> Result<bool, String> {
    let window = main_window(app)?;
    let handle = window.clone();
    let (tx, rx) = std::sync::mpsc::channel::<bool>();
    window
        .run_on_main_thread(move || {
            let Ok(ptr) = handle.ns_window() else {
                let _ = tx.send(false);
                return;
            };
            // SAFETY: as in `apply_layering`.
            let nudged = unsafe {
                let ns: &NSWindow = &*ptr.cast::<NSWindow>();
                let on_space = ns.isOnActiveSpace();
                let visible = ns.isVisible();
                let counted_visible = ns.occlusionState().contains(NSWindowOcclusionState::Visible);
                if visible && on_space && !counted_visible {
                    ns.orderFrontRegardless();
                    true
                } else {
                    false
                }
            };
            let _ = tx.send(nudged);
        })
        .map_err(err)?;
    rx.recv_timeout(std::time::Duration::from_millis(500))
        .map_err(|e| format!("occlusion check timed out: {e}"))
}

#[cfg(not(target_os = "macos"))]
pub fn nudge_occluded(_app: &AppHandle) -> Result<bool, String> {
    Ok(false)
}

/// Shows the window without focusing it. Never calls `set_focus`: with the Accessory activation
/// policy `show()` orders the window front without activating the app.
pub fn show(app: &AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
    // Re-applied on every show, not just at startup. Nothing used to: not this, not the ten-second
    // safety fallback, not the second-launch handler, not the minimise toggle. One shot at boot whose
    // failure went to a console nobody can read is how the window ended up with no collection
    // behaviour at all. It is two property writes; doing them again costs nothing.
    if let Err(e) = apply_layering(&window, layering_from_settings(app)) {
        eprintln!("[webpets] re-applying layering on show failed: {e}");
    }
    window.show().map_err(err)?;
    let state = app.state::<ShellState>();
    state.shown.store(true, Ordering::SeqCst);
    state.visible.store(true, Ordering::SeqCst);
    Ok(())
}

pub fn hide(app: &AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
    window.hide().map_err(err)?;
    app.state::<ShellState>()
        .visible
        .store(false, Ordering::SeqCst);
    Ok(())
}

/// Safety fallback: if the frontend never calls `show_window` (a boot crash), show the window after
/// 10 s so the failure is visible instead of an invisible process.
pub fn spawn_safety_show(app: AppHandle) {
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(SAFETY_SHOW_MS));
        if !app.state::<ShellState>().shown.load(Ordering::SeqCst) {
            eprintln!("[webpets] frontend did not show the window within 10 s; showing it anyway");
            if let Err(e) = show(&app) {
                eprintln!("[webpets] safety show failed: {e}");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const AREA: LRect = LRect {
        x: 0.0,
        y: 25.0,
        w: 1440.0,
        h: 875.0,
    };

    #[test]
    fn layering_defaults_to_everything_on() {
        // What the app did unconditionally before any of this was a setting, and what a missing or
        // unreadable settings file has to fall back to. The regression this pins is the one that
        // shipped: the guarantee moved to a frontend call, every path that skipped it left the window
        // with no collection behaviour, and nothing said so.
        let d = Layering::default();
        assert!(d.always_on_top, "a pet nobody can see is not a pet");
        assert!(d.all_desktops);
        assert!(d.over_fullscreen);
    }

    #[test]
    fn window_sizes_match_contract() {
        // Small moved from 1x to 0.75x so that a fresh install starts ON a named rung; Medium and
        // Large are unchanged, so no existing window resizes on upgrade.
        assert_eq!(window_size_for_scale(SCALE_S), (288.0, 228.0));
        assert_eq!(window_size_for_scale(SCALE_M), (688.0, 528.0));
        assert_eq!(window_size_for_scale(SCALE_L), (1008.0, 768.0));
        // Every legal scale lands on whole pixels; this is the property the eighths exist for.
        for n in MIN_SCALE..=MAX_SCALE {
            let (w, h) = window_size_for_scale(n);
            assert_eq!(w.fract(), 0.0, "width at scale {n} is {w}");
            assert_eq!(h.fract(), 0.0, "height at scale {n} is {h}");
        }
    }

    #[test]
    fn snaps_to_left_and_top_edges_within_16px() {
        let r = LRect { x: 12.0, y: 38.0, w: 368.0, h: 288.0 };
        assert_eq!(snap_and_clamp(r, AREA), (0.0, 25.0));
    }

    #[test]
    fn snaps_to_right_and_bottom_edges_within_16px() {
        let r = LRect { x: 1440.0 - 368.0 - 16.0, y: 900.0 - 288.0 - 10.0, w: 368.0, h: 288.0 };
        assert_eq!(snap_and_clamp(r, AREA), (1072.0, 612.0));
    }

    #[test]
    fn does_not_snap_beyond_threshold() {
        let r = LRect { x: 17.0, y: 42.0, w: 368.0, h: 288.0 };
        assert_eq!(snap_and_clamp(r, AREA), (17.0, 42.0));
    }

    #[test]
    fn clamps_inside_work_area() {
        let r = LRect { x: -300.0, y: 2000.0, w: 368.0, h: 288.0 };
        assert_eq!(snap_and_clamp(r, AREA), (0.0, 612.0));
    }

    #[test]
    fn oversized_window_pins_to_origin() {
        let small = LRect { x: 0.0, y: 0.0, w: 300.0, h: 200.0 };
        let r = LRect { x: 50.0, y: 60.0, w: 688.0, h: 528.0 };
        assert_eq!(snap_and_clamp(r, small), (0.0, 0.0));
    }

    #[test]
    fn rounds_to_whole_pixels() {
        let r = LRect { x: 100.4, y: 100.6, w: 368.0, h: 288.0 };
        assert_eq!(snap_and_clamp(r, AREA), (100.0, 101.0));
    }

    fn positions(entries: &[(&str, f64, f64)], last: Option<&str>) -> Map<String, Value> {
        let mut m = Map::new();
        for (k, x, y) in entries {
            m.insert((*k).to_string(), json!({ "x": x, "y": y }));
        }
        if let Some(l) = last {
            m.insert(LAST_KEY.to_string(), Value::String(l.to_string()));
        }
        m
    }

    fn keys(ks: &[&str]) -> Vec<String> {
        ks.iter().map(|k| (*k).to_string()).collect()
    }

    #[test]
    fn restore_prefers_last_used_monitor_over_current_monitor() {
        let p = positions(
            &[("Built-in@1440x900", 1000.0, 600.0), ("LG@2560x1440", 2100.0, 1100.0)],
            Some("LG@2560x1440"),
        );
        let ks = keys(&["Built-in@1440x900", "LG@2560x1440"]);
        assert_eq!(pick_restore(&p, &ks), Some((1, (2100.0, 1100.0))));
    }

    #[test]
    fn restore_falls_back_to_current_monitor_when_last_is_disconnected() {
        let p = positions(
            &[("Built-in@1440x900", 1000.0, 600.0), ("LG@2560x1440", 2100.0, 1100.0)],
            Some("LG@2560x1440"),
        );
        let ks = keys(&["Built-in@1440x900"]);
        assert_eq!(pick_restore(&p, &ks), Some((0, (1000.0, 600.0))));
    }

    #[test]
    fn restore_falls_back_to_any_saved_monitor_without_last() {
        let p = positions(&[("LG@2560x1440", 2100.0, 1100.0)], None);
        let ks = keys(&["Built-in@1440x900", "LG@2560x1440"]);
        assert_eq!(pick_restore(&p, &ks), Some((1, (2100.0, 1100.0))));
    }

    #[test]
    fn restore_ignores_last_without_a_matching_entry() {
        let p = positions(&[("Built-in@1440x900", 1000.0, 600.0)], Some("LG@2560x1440"));
        let ks = keys(&["Built-in@1440x900", "LG@2560x1440"]);
        assert_eq!(pick_restore(&p, &ks), Some((0, (1000.0, 600.0))));
    }

    #[test]
    fn restore_returns_none_with_no_entries() {
        let p = positions(&[], Some("LG@2560x1440"));
        assert_eq!(pick_restore(&p, &keys(&["LG@2560x1440"])), None);
    }
}

/// Pins the Rust constants above — and the pre-boot fallback size in `tauri.conf.json` — to the
/// TypeScript source they mirror, by parsing `src/sim/constants.ts` at compile time. Nothing computes
/// the window size from these numbers twice without this test noticing: if Rust and TS disagree the
/// window is resized to one size while Pixi sizes its canvas to another, and the click-through hit
/// regions stop matching the visible art. A future stage that changes the grid, the padding or the
/// scale ladder must change TS, the constants here and `tauri.conf.json` together; these assertions
/// are what catch a half-finished change.
#[cfg(test)]
mod contract_sync {
    use super::*;

    const TS_CONSTANTS: &str = include_str!("../../src/sim/constants.ts");
    const TAURI_CONF: &str = include_str!("../tauri.conf.json");
    const TS_PATH: &str = "src/sim/constants.ts";
    const RS_PATH: &str = "src-tauri/src/window.rs";
    const CONF_PATH: &str = "src-tauri/tauri.conf.json";

    /// `constants.ts` with every `//` and `/* */` comment blanked out (newlines kept so any future
    /// line-number reporting stays honest). Scanning the raw text would let a commented-out stale
    /// declaration shadow the live one and silently defeat every assertion below.
    fn ts_source_without_comments() -> String {
        let bytes = TS_CONSTANTS.as_bytes();
        let mut out = String::with_capacity(TS_CONSTANTS.len());
        let (mut i, mut line, mut block) = (0usize, false, false);
        while i < bytes.len() {
            let two = bytes.get(i..i + 2);
            if !line && !block && two == Some(b"//") {
                line = true;
            } else if !line && !block && two == Some(b"/*") {
                block = true;
            } else if block && two == Some(b"*/") {
                block = false;
                out.push_str("  ");
                i += 2;
                continue;
            }
            let c = bytes[i] as char;
            if c == '\n' {
                line = false;
                out.push(c);
            } else {
                out.push(if line || block { ' ' } else { c });
            }
            i += 1;
        }
        out
    }

    /// The initialiser of `export const <name>` in constants.ts: the text between its `=` and its `;`.
    /// Tolerates whitespace and a type annotation, ignores anything inside a comment, and panics with
    /// a pointed message when the scan stops matching, so a reformat fails loudly instead of quietly
    /// skipping the assertions below.
    fn ts_initializer(name: &str) -> String {
        let source = ts_source_without_comments();
        let ts_constants: &str = &source;
        let needle = format!("export const {name}");
        let mut from = 0usize;
        while let Some(i) = ts_constants[from..].find(&needle) {
            let after = from + i + needle.len();
            from = after;
            // Skip a longer identifier that merely starts with `name` (e.g. GRID_W vs GRID_WIDTH).
            if ts_constants[after..]
                .chars()
                .next()
                .is_some_and(|c| c.is_alphanumeric() || c == '_' || c == '$')
            {
                continue;
            }
            let rest = &ts_constants[after..];
            let (Some(eq), Some(semi)) = (rest.find('='), rest.find(';')) else {
                continue;
            };
            if eq > semi {
                continue;
            }
            return rest[eq + 1..semi].trim().to_string();
        }
        panic!(
            "{TS_PATH}: could not find a `export const {name} = <value>;` declaration. \
             This test parses that exact shape to keep {RS_PATH} in sync with it; if the declaration \
             was renamed or reformatted, update `ts_initializer` in {RS_PATH} to match."
        );
    }

    /// A numeric `export const` from constants.ts.
    fn ts_number(name: &str) -> f64 {
        let raw = ts_initializer(name);
        raw.parse::<f64>().unwrap_or_else(|_| {
            panic!(
                "{TS_PATH}: `{name}` is `{raw}`, which is not a plain number literal. \
                 {RS_PATH} mirrors it as a constant, so it has to stay a literal (or this test needs \
                 a smarter parser)."
            )
        })
    }

    /// `width`/`height` of the `main` window entry in tauri.conf.json.
    fn conf_main_window_size() -> (f64, f64) {
        let conf: Value = serde_json::from_str(TAURI_CONF)
            .unwrap_or_else(|e| panic!("{CONF_PATH} is not valid JSON: {e}"));
        let windows = conf["app"]["windows"]
            .as_array()
            .unwrap_or_else(|| panic!("{CONF_PATH}: `app.windows` is missing or not an array."));
        let main = windows
            .iter()
            .find(|w| w["label"].as_str() == Some(MAIN_WINDOW))
            .unwrap_or_else(|| {
                panic!("{CONF_PATH}: no window entry with label \"{MAIN_WINDOW}\".")
            });
        let number = |key: &str| {
            main[key].as_f64().unwrap_or_else(|| {
                panic!("{CONF_PATH}: the \"{MAIN_WINDOW}\" window has no numeric `{key}`.")
            })
        };
        (number("width"), number("height"))
    }

    #[test]
    fn rust_grid_constants_match_typescript() {
        for (name, rust) in [("GRID_W", GRID_W), ("GRID_H", GRID_H), ("WINDOW_PAD", WINDOW_PAD)] {
            let ts = ts_number(name);
            assert_eq!(
                rust, ts,
                "{name} is {rust} in {RS_PATH} but {ts} in {TS_PATH}. These must be equal: TS sizes \
                 the Pixi canvas and the hit regions from its copy while Rust sizes the window from \
                 this one. Fix by setting {name} in {RS_PATH} to {ts}."
            );
        }
    }

    #[test]
    fn accepted_scale_range_matches_typescript_scales() {
        let steps = ts_number("SCALE_STEPS_PER_UNIT");
        assert_eq!(
            SCALE_STEPS_PER_UNIT, steps,
            "SCALE_STEPS_PER_UNIT is {SCALE_STEPS_PER_UNIT} in {RS_PATH} but {steps} in {TS_PATH}. \
             The scale counts eighths of the grid; if the two sides disagree about how many, every \
             window size disagrees too."
        );
        // The assertion that makes "both languages agree to the pixel" a theorem rather than a hope.
        // With the grid divisible by the step count, `window_size_for_scale` is whole-number
        // arithmetic on both sides and there is no rounding rule that could drift.
        for (name, grid) in [("GRID_W", GRID_W), ("GRID_H", GRID_H)] {
            assert_eq!(
                grid % SCALE_STEPS_PER_UNIT,
                0.0,
                "{name} ({grid}) is not divisible by SCALE_STEPS_PER_UNIT ({SCALE_STEPS_PER_UNIT}), \
                 so a window size would be fractional and Rust and TypeScript would have to agree on \
                 a rounding rule. Pick a step count that divides the grid instead."
            );
        }
        let min = ts_number("MIN_SCALE");
        let max = ts_number("MAX_SCALE");
        assert_eq!(f64::from(MIN_SCALE), min, "MIN_SCALE differs between {RS_PATH} and {TS_PATH}");
        assert_eq!(f64::from(MAX_SCALE), max, "MAX_SCALE differs between {RS_PATH} and {TS_PATH}");
        for scale in 0u8..=(MAX_SCALE + 4) {
            let ts_ok = f64::from(scale) >= min && f64::from(scale) <= max;
            assert_eq!(
                scale_supported(scale),
                ts_ok,
                "`set_scale` in {RS_PATH} {} scale {scale}, but {TS_PATH} allows {min}..={max}.",
                if scale_supported(scale) { "accepts" } else { "rejects" }
            );
        }
    }

    #[test]
    fn named_scale_rungs_match_typescript() {
        for (name, rust) in [("SCALE_S", SCALE_S), ("SCALE_M", SCALE_M), ("SCALE_L", SCALE_L)] {
            let ts = ts_number(name);
            assert_eq!(
                f64::from(rust),
                ts,
                "{name} is {rust} in {RS_PATH} but {ts} in {TS_PATH}. `tray.rs` ticks the Size menu's \
                 Small/Medium/Large items by comparing the current scale against these, so a drift \
                 puts the check mark on the wrong row. Fix by setting {name} in {RS_PATH} to {ts}."
            );
        }
        for (name, rung) in [("SCALE_S", SCALE_S), ("SCALE_M", SCALE_M), ("SCALE_L", SCALE_L)] {
            assert!(
                scale_supported(rung),
                "{name} is {rung}, which {RS_PATH} would reject. A rung the Size menu offers has to \
                 be inside MIN_SCALE..=MAX_SCALE, or picking it fails."
            );
        }
    }

    #[test]
    fn tauri_conf_fallback_size_matches_the_default_scale() {
        let default_scale = ts_number("DEFAULT_SCALE");
        assert!(
            default_scale >= ts_number("MIN_SCALE") && default_scale <= ts_number("MAX_SCALE"),
            "DEFAULT_SCALE in {TS_PATH} is {default_scale}, which is outside the legal range."
        );
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let expected = window_size_for_scale(default_scale as u8);
        assert_eq!(
            conf_main_window_size(),
            expected,
            "{CONF_PATH} creates the \"{MAIN_WINDOW}\" window at {:?}, but DEFAULT_SCALE \
             {default_scale} in {TS_PATH} is {expected:?}. That size is the pre-boot fallback the \
             window is created with before TS calls `set_scale`, so a stale value makes the habitat \
             visibly resize on every launch. Fix by setting width/height in {CONF_PATH} to \
             {expected:?}.",
            conf_main_window_size()
        );
    }
}
