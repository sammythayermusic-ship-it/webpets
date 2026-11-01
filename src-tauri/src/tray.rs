//! Tray icon: attaches the Rust-built menu to the tray declared in `tauri.conf.json` (id `main`,
//! `showMenuOnLeftClick: false`), forwards menu clicks as `tray-action` (payload = menu item id =
//! `TrayAction` string), turns a left click (button up) into `toggle-visibility`, and exposes the
//! chip/tooltip/menu-state setters used by the commands. Exactly one tray icon exists: the one from
//! the config; nothing here builds another.

use tauri::image::Image;
use tauri::menu::{CheckMenuItem, ContextMenu, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::state::ShellState;
use crate::window::{scale_fits_work_area, MAIN_WINDOW, SCALE_L, SCALE_M, SCALE_S};

const TRAY_ID: &str = "main";

/// Menu item ids. These are exactly the `TrayAction` strings in `src/platform/types.ts`.
pub const ACTION_FEED: &str = "feed";
pub const ACTION_PANTRY: &str = "pantry";
pub const ACTION_SIZE_S: &str = "size-s";
pub const ACTION_SIZE_M: &str = "size-m";
pub const ACTION_SIZE_L: &str = "size-l";
pub const ACTION_MUTE: &str = "mute";
pub const ACTION_NOTIFICATIONS: &str = "notifications";
pub const ACTION_TALK: &str = "talk";
pub const ACTION_DAYNIGHT_AUTO: &str = "daynight-auto";
pub const ACTION_DAYNIGHT_DAY: &str = "daynight-day";
pub const ACTION_DAYNIGHT_NIGHT: &str = "daynight-night";
pub const ACTION_LAUNCH_AT_LOGIN: &str = "launch-at-login";
pub const ACTION_ALWAYS_ON_TOP: &str = "always-on-top";
pub const ACTION_ALL_DESKTOPS: &str = "all-desktops";
pub const ACTION_OVER_FULLSCREEN: &str = "over-fullscreen";
pub const ACTION_DEV_PANEL: &str = "dev-panel";
pub const ACTION_NEW_PET: &str = "new-pet";
pub const ACTION_TOGGLE_VISIBILITY: &str = "toggle-visibility";
pub const ACTION_QUIT: &str = "quit";

/// Mirrors `TrayMenuState` in `src/platform/types.ts` (flattened into command args).
#[derive(Debug, Clone)]
pub struct TrayMenuState {
    pub scale: u8,
    pub muted: bool,
    pub notifications_muted: bool,
    pub talk_muted: bool,
    pub day_night: String,
    pub launch_at_login: bool,
    pub always_on_top: bool,
    pub all_desktops: bool,
    pub over_fullscreen: bool,
    pub alive: bool,
    pub hidden: bool,
}

/// Handles to the menu items whose state changes at runtime.
pub struct TrayMenu {
    pub menu: Menu<Wry>,
    pub feed: MenuItem<Wry>,
    pub pantry: MenuItem<Wry>,
    pub size_s: CheckMenuItem<Wry>,
    pub size_m: CheckMenuItem<Wry>,
    pub size_l: CheckMenuItem<Wry>,
    pub mute: CheckMenuItem<Wry>,
    pub notifications: CheckMenuItem<Wry>,
    pub talk: CheckMenuItem<Wry>,
    pub daynight_auto: CheckMenuItem<Wry>,
    pub daynight_day: CheckMenuItem<Wry>,
    pub daynight_night: CheckMenuItem<Wry>,
    pub launch_at_login: CheckMenuItem<Wry>,
    pub always_on_top: CheckMenuItem<Wry>,
    pub all_desktops: CheckMenuItem<Wry>,
    pub over_fullscreen: CheckMenuItem<Wry>,
    pub visibility: MenuItem<Wry>,
}

fn check(
    app: &AppHandle,
    id: &str,
    text: &str,
    checked: bool,
) -> tauri::Result<CheckMenuItem<Wry>> {
    CheckMenuItem::with_id(app, id, text, true, checked, None::<&str>)
}

fn item(app: &AppHandle, id: &str, text: &str) -> tauri::Result<MenuItem<Wry>> {
    MenuItem::with_id(app, id, text, true, None::<&str>)
}

fn build_menu(app: &AppHandle) -> tauri::Result<TrayMenu> {
    let feed = item(app, ACTION_FEED, "Feed")?;
    let pantry = item(app, ACTION_PANTRY, "Holiday feeder…")?;
    let size_s = check(app, ACTION_SIZE_S, "Small", false)?;
    let size_m = check(app, ACTION_SIZE_M, "Medium", true)?;
    let size_l = check(app, ACTION_SIZE_L, "Large", false)?;
    let size = Submenu::with_id_and_items(app, "size", "Size", true, &[&size_s, &size_m, &size_l])?;
    let mute = check(app, ACTION_MUTE, "Mute", false)?;
    let notifications = check(app, ACTION_NOTIFICATIONS, "Notifications", true)?;
    let talk = check(app, ACTION_TALK, "Pet talks", true)?;
    let daynight_auto = check(app, ACTION_DAYNIGHT_AUTO, "Auto", true)?;
    let daynight_day = check(app, ACTION_DAYNIGHT_DAY, "Day", false)?;
    let daynight_night = check(app, ACTION_DAYNIGHT_NIGHT, "Night", false)?;
    let daynight = Submenu::with_id_and_items(
        app,
        "daynight",
        "Day/Night",
        true,
        &[&daynight_auto, &daynight_day, &daynight_night],
    )?;
    let launch_at_login = check(app, ACTION_LAUNCH_AT_LOGIN, "Launch at login", false)?;
    let always_on_top = check(app, ACTION_ALWAYS_ON_TOP, "Float above windows", true)?;
    let all_desktops = check(app, ACTION_ALL_DESKTOPS, "Show on every desktop", true)?;
    let over_fullscreen = check(app, ACTION_OVER_FULLSCREEN, "Show over fullscreen apps", true)?;
    let visible_on = Submenu::with_id_and_items(
        app,
        "visible-on",
        "Visible on",
        true,
        &[&always_on_top, &all_desktops, &over_fullscreen],
    )?;
    let dev_panel = item(app, ACTION_DEV_PANEL, "Dev panel")?;
    let new_pet = item(app, ACTION_NEW_PET, "New pet")?;
    let visibility = item(app, ACTION_TOGGLE_VISIBILITY, "Minimize")?;
    let quit = item(app, ACTION_QUIT, "Quit")?;

    let menu = Menu::with_id_and_items(
        app,
        "tray-menu",
        &[
            &feed,
            &pantry,
            &PredefinedMenuItem::separator(app)?,
            &size,
            &mute,
            &talk,
            &notifications,
            &daynight,
            &visible_on,
            &launch_at_login,
            &PredefinedMenuItem::separator(app)?,
            &dev_panel,
            &new_pet,
            &PredefinedMenuItem::separator(app)?,
            &visibility,
            &quit,
        ],
    )?;

    Ok(TrayMenu {
        menu,
        feed,
        pantry,
        size_s,
        size_m,
        size_l,
        mute,
        notifications,
        talk,
        daynight_auto,
        daynight_day,
        daynight_night,
        launch_at_login,
        always_on_top,
        all_desktops,
        over_fullscreen,
        visibility,
    })
}

fn tray(app: &AppHandle) -> Result<TrayIcon<Wry>, String> {
    app.tray_by_id(TRAY_ID)
        .ok_or_else(|| format!("tray icon '{TRAY_ID}' not found; check tauri.conf.json"))
}

/// Called once from `setup`. Attaches the menu and the event handlers to the config-declared tray.
pub fn setup(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let tray = tray(app)?;
    let menu = build_menu(app)?;
    tray.set_menu(Some(menu.menu.clone()))?;
    tray.set_show_menu_on_left_click(false)?;
    tray.on_menu_event(|app, event| {
        let id = event.id().as_ref().to_string();
        if let Err(e) = app.emit("tray-action", id) {
            eprintln!("[webpets] failed to emit tray-action: {e}");
        }
    });
    tray.on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        } = event
        {
            if let Err(e) = tray.app_handle().emit("toggle-visibility", ()) {
                eprintln!("[webpets] failed to emit toggle-visibility: {e}");
            }
        }
    });
    if let Ok(mut guard) = app.state::<ShellState>().tray.lock() {
        *guard = Some(menu);
    }
    Ok(())
}

/// Pops the tray menu up as a context menu at the cursor (right-click on the habitat).
pub fn popup(app: &AppHandle) -> Result<(), String> {
    let webview_window = app
        .get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| "main window not found".to_string())?;
    let window = AsRef::<tauri::Webview<Wry>>::as_ref(&webview_window).window();
    let state = app.state::<ShellState>();
    let guard = state.tray.lock().map_err(|e| e.to_string())?;
    let menu = guard.as_ref().ok_or_else(|| "tray menu not built".to_string())?;
    menu.menu.popup(window).map_err(|e| e.to_string())
}

/// Replaces the tray icon with a raw RGBA bitmap (18x18 or 36x36).
pub fn set_chip(app: &AppHandle, rgba: &[u8], size: u32) -> Result<(), String> {
    if !matches!(size, 18 | 36) {
        return Err(format!("invalid chip size {size}; expected 18 or 36"));
    }
    let expected = (size * size * 4) as usize;
    if rgba.len() != expected {
        return Err(format!(
            "rgba length {} does not match {size}x{size}x4 = {expected}",
            rgba.len()
        ));
    }
    let tray = tray(app)?;
    tray.set_icon(Some(Image::new(rgba, size, size)))
        .map_err(|e| e.to_string())
}

pub fn set_tooltip(app: &AppHandle, text: &str) -> Result<(), String> {
    let tray = tray(app)?;
    tray.set_tooltip(Some(text)).map_err(|e| e.to_string())
}

/// Updates check marks, enabled flags and the Show/Minimize label.
pub fn set_menu_state(app: &AppHandle, s: &TrayMenuState) -> Result<(), String> {
    let state = app.state::<ShellState>();
    let guard = state.tray.lock().map_err(|e| e.to_string())?;
    let m = guard.as_ref().ok_or_else(|| "tray menu not built".to_string())?;
    let e = |r: tauri::Result<()>| r.map_err(|e| e.to_string());

    // A size that does not fit the current monitor's work area is greyed out — L is 1008x768, which
    // is fine on a 1512x982 display and obnoxious on a 1440x900 one. The size in use stays selectable
    // whatever the monitor says, so the checked row is never a disabled row.
    for (item, scale) in [
        (&m.size_s, SCALE_S),
        (&m.size_m, SCALE_M),
        (&m.size_l, SCALE_L),
    ] {
        e(item.set_checked(s.scale == scale))?;
        e(item.set_enabled(s.scale == scale || scale_fits_work_area(app, scale)))?;
    }
    e(m.mute.set_checked(s.muted))?;
    e(m.notifications.set_checked(!s.notifications_muted))?;
    e(m.talk.set_checked(!s.talk_muted))?;
    e(m.daynight_auto.set_checked(s.day_night == "auto"))?;
    e(m.daynight_day.set_checked(s.day_night == "day"))?;
    e(m.daynight_night.set_checked(s.day_night == "night"))?;
    e(m.launch_at_login.set_checked(s.launch_at_login))?;
    e(m.always_on_top.set_checked(s.always_on_top))?;
    e(m.all_desktops.set_checked(s.all_desktops))?;
    e(m.over_fullscreen.set_checked(s.over_fullscreen))?;
    e(m.feed.set_enabled(s.alive))?;
    e(m.pantry.set_enabled(s.alive))?;
    e(m.visibility.set_text(if s.hidden { "Show" } else { "Minimize" }))?;
    Ok(())
}
