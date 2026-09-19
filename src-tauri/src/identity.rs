//! Which build is this?
//!
//! Every copy of the app shares the bundle id `com.sammythayer.webpets`, which is correct -- they are
//! the same app -- but it means macOS cannot tell two builds apart and neither could this app. The
//! failure that forced this module: three copies on a Desktop, the single-instance guard silently
//! surfacing the oldest one whenever a newer one was double-clicked, and a boot report that recorded
//! in detail what the window was doing while saying nothing about which binary wrote it. The fix for
//! the layering sat on disk for an hour, unopened, looking exactly like a fix that did not work.
//!
//! So: the running executable identifies itself, and a launch of a DIFFERENT copy is announced
//! instead of swallowed.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

/// Enough to answer "am I running the build I think I am?" at a glance.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BuildIdentity {
    /// The `.app` bundle this process runs out of, or the bare executable under `npm run tauri dev`.
    pub bundle: String,
    pub exe: String,
    /// `package.version` from the Tauri config.
    pub version: String,
    /// The executable's own mtime in epoch milliseconds: when this binary was linked.
    ///
    /// Milliseconds rather than a formatted date because formatting one would mean a date library in
    /// Rust for a single string, and the only consumer is TypeScript, which already has `Date`.
    pub built_at_ms: Option<u64>,
    /// A launch of a different copy that this instance swallowed. See `lib.rs`.
    pub stale_launch: Option<String>,
}

/// The `.app` bundle a path sits inside, or the path itself.
///
/// A bundled executable lives at `<Name>.app/Contents/MacOS/<exe>`, so the answer is three directories
/// up -- but only when it really is a bundle. Searching the ancestors for the `.app` suffix rather than
/// counting three levels blindly means a dev build, which is not in a bundle at all, reports its own
/// path instead of an invented directory somewhere above `target/`.
pub fn bundle_of(exe: &Path) -> PathBuf {
    for ancestor in exe.ancestors() {
        if ancestor.extension().map_or(false, |e| e == "app") {
            return ancestor.to_path_buf();
        }
    }
    exe.to_path_buf()
}

/// Resolves symlinks so two spellings of one path compare equal; falls back to the input.
///
/// The comparison this feeds decides whether to warn the user, so a false "different build" would be
/// worse than no warning at all. `canonicalize` fails on a path that no longer exists, which is
/// exactly what a deleted second copy looks like -- keep the original text in that case and let the
/// comparison run on it.
pub fn normalize(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// This process's executable, normalized. `<unknown>` if the OS will not say, which it always will.
pub fn current_exe() -> PathBuf {
    std::env::current_exe()
        .map(|p| normalize(&p))
        .unwrap_or_else(|_| PathBuf::from("<unknown>"))
}

/// The bundle this process runs out of.
pub fn current_bundle() -> PathBuf {
    bundle_of(&current_exe())
}

fn mtime_ms(path: &Path) -> Option<u64> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    let since = modified.duration_since(UNIX_EPOCH).ok()?;
    u64::try_from(since.as_millis()).ok()
}

pub fn current(version: &str, stale_launch: Option<String>) -> BuildIdentity {
    let exe = current_exe();
    BuildIdentity {
        bundle: bundle_of(&exe).to_string_lossy().into_owned(),
        built_at_ms: mtime_ms(&exe),
        exe: exe.to_string_lossy().into_owned(),
        version: version.to_string(),
        stale_launch,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_bundle_a_packaged_executable_lives_in() {
        assert_eq!(
            bundle_of(Path::new("/Applications/WebPets.app/Contents/MacOS/webpets")),
            PathBuf::from("/Applications/WebPets.app")
        );
    }

    #[test]
    fn tells_two_copies_apart_by_bundle_even_though_the_executable_name_is_the_same() {
        // The exact shape of the failure: identical bundle id, identical executable name, different
        // build. Only the bundle path distinguishes them, which is why the comparison is done on it.
        let old = bundle_of(Path::new("/Users/x/Desktop/WebPets 3.app/Contents/MacOS/webpets"));
        let new = bundle_of(Path::new("/Applications/WebPets.app/Contents/MacOS/webpets"));
        assert_ne!(old, new);
        assert_eq!(old, PathBuf::from("/Users/x/Desktop/WebPets 3.app"));
    }

    #[test]
    fn a_dev_build_is_not_in_a_bundle_and_reports_itself() {
        // `npm run tauri dev` runs the bare binary out of target/. Walking three levels up
        // unconditionally would have claimed the bundle was `src-tauri/target`, which is not a thing.
        let dev = Path::new("/Users/x/webpets/src-tauri/target/debug/webpets");
        assert_eq!(bundle_of(dev), dev.to_path_buf());
    }

    #[test]
    fn a_path_below_the_bundle_still_resolves_to_the_bundle() {
        assert_eq!(
            bundle_of(Path::new("/Applications/WebPets.app/Contents/Resources/icon.png")),
            PathBuf::from("/Applications/WebPets.app")
        );
    }

    #[test]
    fn this_process_knows_where_it_lives() {
        let id = current("0.0.1", None);
        assert!(!id.exe.is_empty());
        assert_eq!(id.version, "0.0.1");
        // The test binary is not bundled, so the bundle is the executable itself.
        assert_eq!(id.bundle, id.exe);
        assert!(id.built_at_ms.is_some(), "the test binary must have an mtime");
    }
}
