//! File-driven remote control for the packaged app. Compiled ONLY with `--features harness`
//! (see `docs/HARNESS.md`); a normal build does not contain this module or its two commands.
//!
//! Everything lives under `<app_data_dir>/harness/`: a driver drops `inbox/<id>.json`, the webview
//! polls `harness_poll`, runs the command, and writes `out/<id>.result.json` (and any large output
//! such as a PNG or a video) through `harness_write`. Rust only moves bytes; it never interprets a
//! command, so the op set lives entirely in `src/dev/harness.ts`.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};

/// Header the JS side sets on a raw-body `harness_write` invoke to name the output file.
const NAME_HEADER: &str = "x-harness-name";

/// `<app_data_dir>/harness`, with `inbox/` and `out/` created if missing.
fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?
        .join("harness");
    for sub in ["inbox", "out"] {
        fs::create_dir_all(dir.join(sub)).map_err(|e| format!("create {sub}: {e}"))?;
    }
    Ok(dir)
}

/// Only a bare file name made of `[A-Za-z0-9._-]` may be written, so a request can never leave `out/`.
///
/// Takes the basename of whatever was sent, deliberately: a driver that passes a path by mistake
/// gets the file it meant rather than an error about a slash, and the directory part is discarded
/// rather than honoured.
pub fn sanitize_name(raw: &str) -> Result<String, String> {
    let base = raw
        .rsplit(|c| c == '/' || c == '\\')
        .next()
        .unwrap_or("")
        .trim();
    if base.is_empty() || base == "." || base == ".." {
        return Err(format!("harness: empty or dot-only file name {raw:?}"));
    }
    if let Some(bad) = base
        .chars()
        .find(|c| !(c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')))
    {
        return Err(format!("harness: file name {raw:?} contains {bad:?}; allowed: [A-Za-z0-9._-]"));
    }
    Ok(base.to_string())
}

/// Reads every `inbox/*.json` in file-name order, deletes each after reading, returns the contents.
///
/// Delete-after-read is what makes a command consumed exactly once: a file that fails to read stays
/// in the inbox and is reported on stderr rather than silently dropped.
#[tauri::command]
pub fn harness_poll(app: AppHandle) -> Result<Vec<String>, String> {
    let inbox = root(&app)?.join("inbox");
    let mut paths: Vec<PathBuf> = fs::read_dir(&inbox)
        .map_err(|e| format!("read inbox: {e}"))?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|ext| ext == "json").unwrap_or(false))
        .collect();
    paths.sort();
    let mut contents = Vec::with_capacity(paths.len());
    for path in paths {
        match fs::read_to_string(&path) {
            Ok(text) => {
                if let Err(e) = fs::remove_file(&path) {
                    eprintln!("[harness] could not delete {}: {e}", path.display());
                }
                contents.push(text);
            }
            Err(e) => eprintln!("[harness] could not read {}: {e}", path.display()),
        }
    }
    Ok(contents)
}

/// Writes a raw request body to `out/<name>` and returns the absolute path.
///
/// Raw-body IPC (`invoke('harness_write', new Uint8Array(bytes), { headers: { 'x-harness-name': name } })`)
/// so a 20-second video crosses the bridge as bytes rather than as a JSON array of numbers. A JSON
/// body holding a byte array is still accepted, because that is all Android can send.
///
/// Written to `<name>.part` and renamed, so a driver polling for the file never reads a half-written one.
#[tauri::command]
pub fn harness_write(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let raw_name = request
        .headers()
        .get(NAME_HEADER)
        .ok_or_else(|| format!("harness_write: missing {NAME_HEADER} header"))?
        .to_str()
        .map_err(|e| format!("harness_write: {NAME_HEADER} is not ASCII: {e}"))?;
    let name = sanitize_name(raw_name)?;
    let bytes: Vec<u8> = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(value) => serde_json::from_value(value.clone())
            .map_err(|e| format!("harness_write: JSON body is not a byte array: {e}"))?,
    };
    let out = root(&app)?.join("out");
    write_atomic(&out, &name, &bytes)
}

fn write_atomic(dir: &Path, name: &str, bytes: &[u8]) -> Result<String, String> {
    let final_path = dir.join(name);
    let part_path = dir.join(format!("{name}.part"));
    fs::write(&part_path, bytes).map_err(|e| format!("write {}: {e}", part_path.display()))?;
    fs::rename(&part_path, &final_path)
        .map_err(|e| format!("rename to {}: {e}", final_path.display()))?;
    Ok(final_path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_keeps_plain_names() {
        assert_eq!(sanitize_name("shot-1.png").unwrap(), "shot-1.png");
        assert_eq!(sanitize_name("abc.result.json").unwrap(), "abc.result.json");
        assert_eq!(sanitize_name("clip_20s.mp4").unwrap(), "clip_20s.mp4");
    }

    #[test]
    fn sanitize_takes_the_basename() {
        assert_eq!(sanitize_name("/etc/passwd").unwrap(), "passwd");
        assert_eq!(sanitize_name("..\\..\\x.png").unwrap(), "x.png");
        assert_eq!(sanitize_name("a/b/../c.png").unwrap(), "c.png");
    }

    #[test]
    fn sanitize_rejects_empty_dots_and_odd_characters() {
        assert!(sanitize_name("").is_err());
        assert!(sanitize_name("   ").is_err());
        assert!(sanitize_name(".").is_err());
        assert!(sanitize_name("..").is_err());
        assert!(sanitize_name("dir/").is_err());
        assert!(sanitize_name("a b.png").is_err());
        assert!(sanitize_name("a:b.png").is_err());
        assert!(sanitize_name("ünïcode.png").is_err());
    }

    #[test]
    fn write_atomic_leaves_no_part_file() {
        let dir = std::env::temp_dir().join(format!("webpets-harness-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = write_atomic(&dir, "x.bin", b"hello").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"hello");
        assert!(!dir.join("x.bin.part").exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
