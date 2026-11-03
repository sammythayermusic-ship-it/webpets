//! WebPets shell: transparent always-on-top habitat window, tray, click-through poller,
//! notifications, clock, autostart, global shortcut and single-instance guard.
//! The command/event surface is the contract in `docs/ARCHITECTURE.md`.

mod clock;
mod commands;
mod focus;
/// Verification-only remote control; absent from a normal build. See `docs/HARNESS.md`.
#[cfg(feature = "harness")]
mod harness;
mod hittest;
mod identity;
mod idle;
mod links;
mod state;
mod tray;
mod voice;
mod window;

use std::path::Path;
use std::sync::atomic::Ordering;

use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_notification::NotificationExt;

use state::ShellState;

/// Global shortcut that toggles the habitat (fires on key press only).
const TOGGLE_SHORTCUT: &str = "Cmd+Shift+P";

/// Handles a second launch: surface the running habitat, and say so if it is not the copy that was
/// opened.
///
/// The plain version of this threw `argv` away, and that turned out to be the expensive half. Every
/// build shares the bundle id, so macOS routes a double-click of a freshly built `.app` to whichever
/// copy is already running; this callback fired, the old window came forward, and the copy the user
/// actually opened never started. Silently. A layering fix sat unopened on a Desktop for an hour
/// while the build from half an hour earlier sat on screen failing in exactly the way the fix
/// addressed, and every diagnostic agreed the app was fine -- because it was; it was the wrong app.
///
/// `argv[0]` is the executable path of the copy that was opened, which is the one fact that
/// distinguishes the two.
///
/// Note what this deliberately does NOT do: hand over to the new copy. By the time this runs the
/// second process has already exited, so "newest wins" would mean relaunching that bundle from inside
/// the process that is quitting -- a race against the single-instance lock whose losing outcome is no
/// habitat running at all. Naming both paths and letting the user choose is the honest trade.
fn on_second_launch(app: &tauri::AppHandle, argv: &[String]) {
    let running = identity::current_bundle();
    let launched = argv
        .first()
        .map(|arg| identity::bundle_of(&identity::normalize(Path::new(arg))));

    if let Some(launched) = launched.filter(|l| *l != running) {
        let (launched, running) = (launched.display().to_string(), running.display().to_string());
        eprintln!("[webpets] a different copy was launched: {launched} (running: {running})");
        if let Ok(mut slot) = app.state::<ShellState>().stale_launch.lock() {
            *slot = Some(launched.clone());
        }
        if let Err(e) = app
            .notification()
            .builder()
            .title("WebPets is already running")
            .body(format!(
                "The copy you opened did not start:\n{launched}\n\nStill running:\n{running}\n\nQuit WebPets from the menu bar first."
            ))
            .show()
        {
            eprintln!("[webpets] could not notify about the stale launch: {e}");
        }
    }

    if let Err(e) = window::show(app) {
        eprintln!("[webpets] single-instance show failed: {e}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shortcuts = tauri_plugin_global_shortcut::Builder::new()
        .with_shortcuts([TOGGLE_SHORTCUT])
        .expect("TOGGLE_SHORTCUT must parse")
        .with_handler(|app, _shortcut, event| {
            if matches!(event.state, ShortcutState::Pressed) {
                if let Err(e) = app.emit("toggle-visibility", ()) {
                    eprintln!("[webpets] failed to emit toggle-visibility: {e}");
                }
            }
        })
        .build();

    tauri::Builder::default()
        // Plugin order per the contract: single-instance first, then store, notification,
        // autostart, global-shortcut, positioner.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // A second launch just surfaces the running habitat; never focus. See `on_second_launch`
            // for why `argv` is no longer discarded.
            on_second_launch(app, &argv);
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(shortcuts)
        .plugin(tauri_plugin_positioner::init())
        .manage(ShellState::default())
        .invoke_handler(tauri::generate_handler![
            commands::clock_now,
            commands::set_scale,
            commands::set_layering,
            commands::get_layering,
            commands::build_identity,
            commands::set_scale_live,
            commands::set_interaction_lock,
            commands::set_hit_regions,
            commands::get_geometry,
            commands::show_window,
            commands::hide_window,
            commands::popup_menu,
            commands::tray_set_chip,
            commands::tray_set_tooltip,
            commands::tray_set_menu_state,
            commands::notify,
            commands::autostart_get,
            commands::autostart_set,
            commands::quit_app,
            idle::input_idle,
            focus::begin_typing,
            focus::end_typing,
            focus::open_card,
            focus::close_card,
            links::open_link,
            voice::voice_status,
            voice::voice_write,
            #[cfg(feature = "harness")]
            harness::harness_poll,
            #[cfg(feature = "harness")]
            harness::harness_write,
        ])
        .setup(|app| {
            // No Dock icon, no app menu bar: the tray is the app's home.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle().clone();
            // The window is created hidden (tauri.conf.json visible: false); TS shows it at the
            // end of boot. Rust never shows it on its own except the 10 s safety fallback.
            if let Some(w) = handle.get_webview_window(window::MAIN_WINDOW) {
                // Layering, from the persisted settings, here on the main thread before the event
                // loop and before anything can show the window.
                //
                // This used to be an unconditional `set_visible_on_all_workspaces(true)`. Turning it
                // into a setting moved it to a call the frontend makes near the end of boot, and that
                // was a mistake: any failure earlier in boot, the ten-second safety show, or the call
                // itself rejecting all left the window with NO collection behaviour, while the window
                // config kept it floating so it still looked like "always on top" worked. On a Mac
                // with Stage Manager on, a window without that behaviour is treated as an ordinary app
                // window and shuffled behind whatever has focus.
                if let Err(e) = window::set_layering(&handle, window::layering_from_settings(&handle)) {
                    eprintln!("[webpets] applying layering at startup failed: {e}");
                }
                let visible = w.is_visible().unwrap_or(false);
                handle
                    .state::<ShellState>()
                    .visible
                    .store(visible, Ordering::SeqCst);
            }
            tray::setup(&handle)?;
            hittest::spawn(handle.clone());
            clock::spawn(handle.clone());
            window::spawn_safety_show(handle);
            Ok(())
        })
        .on_window_event(|w, event| match event {
            WindowEvent::Moved(position) if w.label() == window::MAIN_WINDOW => {
                window::on_moved(w.app_handle(), *position);
            }
            WindowEvent::Destroyed if w.label() == focus::CARD_WINDOW => focus::on_card_destroyed(w.app_handle()),
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
