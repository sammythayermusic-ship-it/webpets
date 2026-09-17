//! Wall + monotonic clock readings and the sleep/wake detector.
//!
//! `Instant` on macOS is `CLOCK_UPTIME_RAW`, which does not advance while the machine sleeps, so a
//! wall-clock jump that the monotonic clock did not see means the process was suspended (or the
//! clock was changed). The sim only ever uses wall timestamps; `wake` just tells the scheduler to
//! reconcile right away instead of waiting for its next 30 s tick.

use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Sample interval of the wake detector.
const SAMPLE_MS: u64 = 5_000;
/// Wall-minus-monotonic drift above which a `wake` event is emitted.
const WAKE_THRESHOLD_MS: f64 = 5_000.0;

static PROCESS_START: OnceLock<Instant> = OnceLock::new();

/// Mirrors `ClockReading` in `src/platform/types.ts`.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockReading {
    /// SystemTime epoch ms.
    pub wall_ms: f64,
    /// Instant-based ms since the process started.
    pub mono_ms: f64,
}

pub fn now() -> ClockReading {
    let start = PROCESS_START.get_or_init(Instant::now);
    let wall_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
        .floor();
    let mono_ms = (start.elapsed().as_secs_f64() * 1000.0).floor();
    ClockReading { wall_ms, mono_ms }
}

/// Emits `wake` whenever the wall clock advanced more than 5 s beyond the monotonic clock
/// between two 5 s samples.
pub fn spawn(app: AppHandle) {
    // Pin the process start so `mono_ms` is meaningful from the first `clock_now` call.
    let _ = PROCESS_START.get_or_init(Instant::now);
    thread::spawn(move || {
        let mut last = now();
        loop {
            thread::sleep(Duration::from_millis(SAMPLE_MS));
            let cur = now();
            let wall_delta = cur.wall_ms - last.wall_ms;
            let mono_delta = cur.mono_ms - last.mono_ms;
            if wall_delta - mono_delta > WAKE_THRESHOLD_MS {
                println!(
                    "[webpets] wake detected: wall advanced {wall_delta:.0} ms, monotonic {mono_delta:.0} ms"
                );
                if let Err(e) = app.emit("wake", ()) {
                    eprintln!("[webpets] failed to emit wake: {e}");
                }
            }
            last = cur;
        }
    });
}
