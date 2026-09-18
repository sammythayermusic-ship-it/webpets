//! Tauri commands. Names and camelCase JSON shapes are the contract in `docs/ARCHITECTURE.md`
//! ("Tauri commands and events"). Args are looked up by the camelCase form of each parameter.

use tauri::{AppHandle, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;

use crate::clock::{self, ClockReading};
use crate::state::{HitRect, ShellState};
use crate::tray::{self, TrayMenuState};
use crate::window::{self, WindowGeometry};

#[tauri::command]
pub fn clock_now() -> ClockReading {
    clock::now()
}

#[tauri::command]
pub fn set_scale(app: AppHandle, scale: u8) -> Result<WindowGeometry, String> {
    window::set_scale(&app, scale)
}

#[tauri::command]
pub fn set_hit_regions(state: State<'_, ShellState>, regions: Vec<HitRect>) -> Result<(), String> {
    let mut guard = state.regions.lock().map_err(|e| e.to_string())?;
    *guard = regions;
    Ok(())
}

#[tauri::command]
pub fn set_layering(
    app: AppHandle,
    always_on_top: bool,
    all_desktops: bool,
    over_fullscreen: bool,
) -> Result<(), String> {
    window::set_layering(&app, always_on_top, all_desktops, over_fullscreen)
}

#[tauri::command]
pub fn get_geometry(app: AppHandle) -> Result<WindowGeometry, String> {
    window::current_geometry(&app)
}

#[tauri::command]
pub fn show_window(app: AppHandle) -> Result<(), String> {
    window::show(&app)
}

#[tauri::command]
pub fn hide_window(app: AppHandle) -> Result<(), String> {
    window::hide(&app)
}

#[tauri::command]
pub fn popup_menu(app: AppHandle) -> Result<(), String> {
    tray::popup(&app)
}

#[tauri::command]
pub fn tray_set_chip(app: AppHandle, rgba: Vec<u8>, size: u32) -> Result<(), String> {
    tray::set_chip(&app, &rgba, size)
}

#[tauri::command]
pub fn tray_set_tooltip(app: AppHandle, text: String) -> Result<(), String> {
    tray::set_tooltip(&app, &text)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn tray_set_menu_state(
    app: AppHandle,
    scale: u8,
    muted: bool,
    notifications_muted: bool,
    day_night: String,
    launch_at_login: bool,
    always_on_top: bool,
    all_desktops: bool,
    over_fullscreen: bool,
    alive: bool,
    hidden: bool,
) -> Result<(), String> {
    tray::set_menu_state(
        &app,
        &TrayMenuState {
            scale,
            muted,
            notifications_muted,
            day_night,
            launch_at_login,
        always_on_top,
        all_desktops,
        over_fullscreen,
            alive,
            hidden,
        },
    )
}

/// Logs first: the notification plugin swallows delivery errors, so the log line is the only trace.
#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    println!("[webpets] notify: {title} — {body}");
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn autostart_get(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn autostart_set(app: AppHandle, on: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    let result = if on {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    // RunEvent::Exit lets the store plugin flush every loaded store before the process ends.
    app.exit(0);
}
