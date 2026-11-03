//! Keyboard focus, for the two times the pet needs your keys (AFTER-BAKEOFF Step E): typing to it, and
//! the "Get to know me" card. The app is an Accessory and otherwise never activates (window.rs), so
//! these are the only places it takes focus, and each hands it straight back to the app you were in.
//!
//! `begin_typing` remembers the frontmost app, then makes the habitat window key. `end_typing` gives
//! the keys back, unless the card is still open. The card is its own ordinary window ("card",
//! card.html): opening it takes focus the same way; closing it gives focus back.

use std::sync::Mutex;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::window::{main_window, MAIN_WINDOW};

pub const CARD_WINDOW: &str = "card";
const CARD_SIZE: (f64, f64) = (440.0, 640.0);

/// The app that was in front when we took focus; it gets focus back.
static PREVIOUS: Mutex<Option<i32>> = Mutex::new(None);

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Note the frontmost app, unless it is us (focus is already ours and the first owner is kept).
fn remember_front() {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWorkspace;
        let ours = std::process::id() as i32;
        let front = NSWorkspace::sharedWorkspace().frontmostApplication().map(|a| a.processIdentifier());
        if let (Some(pid), Ok(mut prev)) = (front, PREVIOUS.lock()) {
            if pid != ours && prev.is_none() {
                *prev = Some(pid);
            }
        }
    }
}

/// Hand focus back to the app that had it. Quietly does nothing if it has quit meanwhile.
fn give_back(app: &AppHandle) {
    let Some(pid) = PREVIOUS.lock().ok().and_then(|mut p| p.take()) else { return };
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(move || {
            use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
            if let Some(other) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
                other.activateWithOptions(NSApplicationActivationOptions::empty());
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, pid);
}

#[tauri::command]
pub fn begin_typing(app: AppHandle) -> Result<(), String> {
    remember_front();
    main_window(&app)?.set_focus().map_err(err)
}

#[tauri::command]
pub fn end_typing(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window(CARD_WINDOW).is_none() {
        give_back(&app);
    }
    Ok(())
}

#[tauri::command]
pub fn open_card(app: AppHandle) -> Result<(), String> {
    remember_front();
    if let Some(card) = app.get_webview_window(CARD_WINDOW) {
        return card.set_focus().map_err(err);
    }
    let card = WebviewWindowBuilder::new(&app, CARD_WINDOW, WebviewUrl::App("card.html".into()))
        .title("Get to know me")
        .inner_size(CARD_SIZE.0, CARD_SIZE.1)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .center()
        .focused(true)
        .build()
        .map_err(err)?;
    card.set_focus().map_err(err)
}

#[tauri::command]
pub fn close_card(app: AppHandle) -> Result<(), String> {
    if let Some(card) = app.get_webview_window(CARD_WINDOW) {
        card.close().map_err(err)?;
    }
    Ok(())
}

/// From the window-event hook: the card has gone, so focus goes back (unless you are mid-sentence
/// with the pet, which keeps it until you finish).
pub fn on_card_destroyed(app: &AppHandle) {
    let typing = app
        .get_webview_window(MAIN_WINDOW)
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false);
    if !typing {
        give_back(app);
    }
}
