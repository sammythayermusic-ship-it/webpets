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

use crate::state::ShellState;

pub const MAIN_WINDOW: &str = "main";

/// Habitat grid and padding (contract: `GRID_W`, `GRID_H`, `WINDOW_PAD` in `src/sim/constants.ts`).
const GRID_W: f64 = 160.0;
const GRID_H: f64 = 120.0;
const WINDOW_PAD: f64 = 24.0;
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

/// Window size for an integer scale: `(160s + 48) x (120s + 48)`.
pub fn window_size_for_scale(scale: u8) -> (f64, f64) {
    let s = f64::from(scale);
    (GRID_W * s + 2.0 * WINDOW_PAD, GRID_H * s + 2.0 * WINDOW_PAD)
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

/// `set_scale`: resize to `(160s+48, 120s+48)` keeping the bottom-right corner fixed. The first call
/// after launch instead restores `positions[monitorKey]` (preferring the monitor recorded in
/// `positions.last` when it is connected, then the monitor the window is on, then any other
/// connected monitor with a saved position) or defaults to the bottom-right corner of the primary
/// work area with a 24 px margin. The result is clamped to the work area and persisted.
pub fn set_scale(app: &AppHandle, scale: u8) -> Result<WindowGeometry, String> {
    if !(2..=4).contains(&scale) {
        return Err(format!("invalid scale {scale}; expected 2, 3 or 4"));
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
            let (x, y) = snap_and_clamp(LRect { x, y, w, h }, work_area(m));
            (x, y, monitor_key(m))
        }
        None => (x.round(), y.round(), "unknown@0x0".to_string()),
    };

    apply_geometry(app, &window, sf, x, y, Some((w, h)))?;
    if monitor.is_some() {
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

/// Shows the window without focusing it. Never calls `set_focus`: with the Accessory activation
/// policy `show()` orders the window front without activating the app.
pub fn show(app: &AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
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
    fn window_sizes_match_contract() {
        assert_eq!(window_size_for_scale(2), (368.0, 288.0));
        assert_eq!(window_size_for_scale(3), (528.0, 408.0));
        assert_eq!(window_size_for_scale(4), (688.0, 528.0));
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
