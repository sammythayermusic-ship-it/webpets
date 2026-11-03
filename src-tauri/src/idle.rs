//! How long since you last typed, and whether a full-screen app is in front, so the pet can keep
//! quiet while you are busy (AFTER-BAKEOFF Step D.3). Reads the window server's idle counters: no
//! key logging, no permission prompt: two numbers of seconds and a yes or no.

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
    /// A full-screen window fills a display on the current Space (a film, a presentation, a full-screen app).
    fullscreen: bool,
}

/// True when an ordinary window (layer 0) on the current Space covers a whole display, menu bar strip
/// included. A zoomed window stops below the menu bar, so only full-screen ones match. Reads the
/// window list the window server hands to anyone: bounds and layers, no titles, no permission.
#[cfg(target_os = "macos")]
fn fullscreen_in_front() -> bool {
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;
    use core_graphics::display::{CGDisplay, CGRect};
    use core_graphics::window::{
        copy_window_info, kCGNullWindowID, kCGWindowBounds, kCGWindowLayer, kCGWindowListExcludeDesktopElements,
        kCGWindowListOptionOnScreenOnly,
    };

    let displays: Vec<CGRect> = CGDisplay::active_displays()
        .unwrap_or_default()
        .into_iter()
        .map(|id| CGDisplay::new(id).bounds())
        .collect();
    let Some(list) = copy_window_info(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID) else {
        return false;
    };
    // SAFETY: the window-list keys are constant CFStrings owned by CoreGraphics.
    let (layer_key, bounds_key) = unsafe { (CFString::wrap_under_get_rule(kCGWindowLayer), CFString::wrap_under_get_rule(kCGWindowBounds)) };
    for raw in list.iter() {
        // SAFETY: every element of the window list is a CFDictionary; get-rule retains it for this scope.
        let info: CFDictionary<CFString, CFType> = unsafe { CFDictionary::wrap_under_get_rule(*raw as CFDictionaryRef) };
        let layer = info.find(&layer_key).and_then(|v| v.downcast::<CFNumber>()).and_then(|n| n.to_i64());
        if layer != Some(0) {
            continue;
        }
        let Some(bounds) = info.find(&bounds_key) else { continue };
        if !bounds.instance_of::<CFDictionary>() {
            continue;
        }
        // SAFETY: checked to be a CFDictionary just above.
        let dict: CFDictionary = unsafe { CFDictionary::wrap_under_get_rule(bounds.as_CFTypeRef() as CFDictionaryRef) };
        let Some(r) = CGRect::from_dict_representation(&dict) else { continue };
        let covers = |d: &CGRect| {
            (r.origin.x - d.origin.x).abs() < 1.0
                && (r.origin.y - d.origin.y).abs() < 1.0
                && (r.size.width - d.size.width).abs() < 1.0
                && (r.size.height - d.size.height).abs() < 1.0
        };
        if displays.iter().any(covers) {
            return true;
        }
    }
    false
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
        InputIdle { keys: sane(keys), any: sane(any), fullscreen: fullscreen_in_front() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        InputIdle { keys: f64::MAX, any: f64::MAX, fullscreen: false }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn idle_counters_are_never_negative() {
        let i = super::input_idle();
        assert!(i.keys >= 0.0 && i.any >= 0.0);
    }
}
