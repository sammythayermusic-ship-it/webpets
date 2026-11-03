//! How long since you last typed, and whether anyone can see the pet right now, so it keeps quiet
//! while you are busy (AFTER-BAKEOFF Step D.3). Reads the window server's idle counters and its
//! on-screen window list: no key logging, no titles, no permission prompt. Two numbers of seconds
//! and a yes or no.

use serde::Serialize;

#[cfg(target_os = "macos")]
mod cg {
    /// kCGEventSourceStateCombinedSessionState
    pub const COMBINED_SESSION: i32 = 0;
    /// kCGEventKeyDown
    pub const KEY_DOWN: u32 = 10;
    /// kCGAnyInputEventType
    pub const ANY_INPUT: u32 = u32::MAX;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        pub fn CGEventSourceSecondsSinceLastEventType(source: i32, event_type: u32) -> f64;
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputIdle {
    /// Seconds since the last key press anywhere.
    keys: f64,
    /// Seconds since any input (keys, mouse, trackpad).
    any: f64,
    /// Nobody can see the pet: its window is not on screen (another Space, a full-screen app has
    /// the display, or it is hidden), or a full-screen app is in front of it.
    unseen: bool,
}

/// One on-screen window, as much of it as the decision needs.
#[derive(Clone, Copy, Debug)]
struct Win<'a> {
    pid: i64,
    owner: &'a str,
    layer: i64,
    rect: Rect,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

impl Rect {
    fn same(&self, o: &Rect) -> bool {
        (self.x - o.x).abs() < 1.0 && (self.y - o.y).abs() < 1.0 && (self.w - o.w).abs() < 1.0 && (self.h - o.h).abs() < 1.0
    }
}

/// The pet is unseen when its habitat window (ours, above ordinary windows, taller than a menu bar
/// item) is not on screen, or a
/// full-screen Space is showing. A full-screen Space is told by the Dock, which puts a second window
/// below every app on that display, a backdrop on top of the wallpaper; a desktop Space has only the
/// wallpaper there. Window bounds can't tell it: on a display with a notch a full-screen window stops
/// below the notch, exactly where a zoomed window starts.
fn unseen(windows: &[Win], displays: &[Rect], own_pid: i64) -> bool {
    let own_on_screen = windows.iter().any(|w| w.pid == own_pid && w.layer > 0 && w.rect.h > 40.0);
    let full_screen_space = displays.iter().any(|d| {
        windows.iter().filter(|w| w.owner == "Dock" && w.layer < 0 && w.rect.same(d)).count() >= 2
    });
    !own_on_screen || full_screen_space
}

#[cfg(target_os = "macos")]
fn look() -> bool {
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;
    use core_graphics::display::{CGDisplay, CGRect};
    use core_graphics::window::{
        copy_window_info, kCGNullWindowID, kCGWindowBounds, kCGWindowLayer, kCGWindowListOptionOnScreenOnly, kCGWindowOwnerName,
        kCGWindowOwnerPID,
    };

    let rect = |r: CGRect| Rect { x: r.origin.x, y: r.origin.y, w: r.size.width, h: r.size.height };
    let displays: Vec<Rect> = CGDisplay::active_displays()
        .unwrap_or_default()
        .into_iter()
        .map(|id| rect(CGDisplay::new(id).bounds()))
        .collect();
    let Some(list) = copy_window_info(kCGWindowListOptionOnScreenOnly, kCGNullWindowID) else {
        return false;
    };
    // SAFETY: the window-list keys are constant CFStrings owned by CoreGraphics.
    let (layer_key, bounds_key, pid_key, owner_key) = unsafe {
        (
            CFString::wrap_under_get_rule(kCGWindowLayer),
            CFString::wrap_under_get_rule(kCGWindowBounds),
            CFString::wrap_under_get_rule(kCGWindowOwnerPID),
            CFString::wrap_under_get_rule(kCGWindowOwnerName),
        )
    };
    let mut owners: Vec<(i64, String, i64, Rect)> = Vec::new();
    for raw in list.iter() {
        // SAFETY: every element of the window list is a CFDictionary; get-rule retains it for this scope.
        let info: CFDictionary<CFString, CFType> = unsafe { CFDictionary::wrap_under_get_rule(*raw as CFDictionaryRef) };
        let num = |k: &CFString| info.find(k).and_then(|v| v.downcast::<CFNumber>()).and_then(|n| n.to_i64());
        let (Some(layer), Some(pid)) = (num(&layer_key), num(&pid_key)) else { continue };
        let owner = info.find(&owner_key).and_then(|v| v.downcast::<CFString>()).map(|s| s.to_string()).unwrap_or_default();
        let Some(bounds) = info.find(&bounds_key) else { continue };
        if !bounds.instance_of::<CFDictionary>() {
            continue;
        }
        // SAFETY: checked to be a CFDictionary just above.
        let dict: CFDictionary = unsafe { CFDictionary::wrap_under_get_rule(bounds.as_CFTypeRef() as CFDictionaryRef) };
        let Some(r) = CGRect::from_dict_representation(&dict) else { continue };
        owners.push((pid, owner, layer, rect(r)));
    }
    let windows: Vec<Win> = owners.iter().map(|(pid, owner, layer, r)| Win { pid: *pid, owner, layer: *layer, rect: *r }).collect();
    unseen(&windows, &displays, i64::from(std::process::id()))
}

#[tauri::command]
pub fn input_idle() -> InputIdle {
    #[cfg(target_os = "macos")]
    {
        // SAFETY: a pure query of the window server's counters; no pointers cross the boundary.
        let (keys, any) = unsafe {
            (
                cg::CGEventSourceSecondsSinceLastEventType(cg::COMBINED_SESSION, cg::KEY_DOWN),
                cg::CGEventSourceSecondsSinceLastEventType(cg::COMBINED_SESSION, cg::ANY_INPUT),
            )
        };
        let sane = |s: f64| if s.is_finite() && s >= 0.0 { s } else { f64::MAX };
        InputIdle { keys: sane(keys), any: sane(any), unseen: look() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        InputIdle { keys: f64::MAX, any: f64::MAX, unseen: false }
    }
}

#[cfg(test)]
mod tests {
    use super::{unseen, Rect, Win};

    const ME: i64 = 7;
    const DISPLAY: Rect = Rect { x: 0.0, y: 0.0, w: 1512.0, h: 982.0 };
    const MIN: i64 = i32::MIN as i64;

    fn win(pid: i64, owner: &str, layer: i64, x: f64, y: f64, w: f64, h: f64) -> Win<'_> {
        Win { pid, owner, layer, rect: Rect { x, y, w, h } }
    }

    #[test]
    fn idle_counters_are_never_negative() {
        let i = super::input_idle();
        assert!(i.keys >= 0.0 && i.any >= 0.0);
    }

    // Both lists were read off a MacBook with a notch (2026-11-02): the desktop with the pet on it,
    // and Chrome full screen, whose window starts below the notch at y 33.
    #[test]
    fn seen_on_a_desktop_space() {
        let desktop = [
            win(ME, "WebPets", 25, 613.0, 220.0, 768.0, 588.0),
            win(2, "Dock", 20, 0.0, 0.0, 1512.0, 982.0),
            win(3, "Finder", MIN + 45, 0.0, 0.0, 1512.0, 982.0),
            win(2, "Dock", MIN + 24, 0.0, 0.0, 1512.0, 982.0),
            win(4, "Wallpaper", MIN + 23, 0.0, 0.0, 1512.0, 982.0),
            win(5, "Window Server", MIN + 22, 0.0, 0.0, 1512.0, 982.0),
        ];
        assert!(!unseen(&desktop, &[DISPLAY], ME));
    }

    #[test]
    fn unseen_when_a_full_screen_app_has_the_display() {
        let chrome = [
            win(9, "Google Chrome", 26, 0.0, 0.0, 1512.0, 155.0),
            win(5, "Window Server", 24, 0.0, 0.0, 1512.0, 33.0),
            win(9, "Google Chrome", 0, 0.0, 33.0, 1512.0, 949.0),
            win(2, "Dock", MIN + 26, 0.0, 0.0, 1512.0, 982.0),
            win(2, "Dock", MIN + 24, 0.0, 0.0, 1512.0, 982.0),
            win(5, "Window Server", MIN + 22, 0.0, 0.0, 1512.0, 982.0),
        ];
        // Ordinarily the pet's window is not on a full-screen Space at all.
        assert!(unseen(&chrome, &[DISPLAY], ME));
        // Set to float over full-screen apps it is there, but you are watching or working full screen.
        let mut over = chrome.to_vec();
        over.push(win(ME, "WebPets", 25, 613.0, 220.0, 768.0, 588.0));
        assert!(unseen(&over, &[DISPLAY], ME));
    }

    #[test]
    fn unseen_when_hidden_or_on_another_space() {
        let elsewhere = [win(2, "Dock", 20, 0.0, 0.0, 1512.0, 982.0), win(2, "Dock", MIN + 24, 0.0, 0.0, 1512.0, 982.0)];
        assert!(unseen(&elsewhere, &[DISPLAY], ME));
        // A menu bar item of ours is not the pet.
        let tray_only = [win(ME, "WebPets", 25, 1101.0, 0.0, 32.0, 33.0), win(ME, "WebPets", 0, 0.0, 0.0, 1512.0, 33.0)];
        assert!(unseen(&tray_only, &[DISPLAY], ME));
    }
}
