//! How long since you last typed, and since you last touched the Mac at all, so the pet can keep
//! quiet while you are busy (AFTER-BAKEOFF Step D.3). Reads the window server's idle counters: no
//! key logging, no permission prompt, nothing but two numbers of seconds.

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
        InputIdle { keys: sane(keys), any: sane(any) }
    }
    #[cfg(not(target_os = "macos"))]
    {
        InputIdle { keys: f64::MAX, any: f64::MAX }
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
