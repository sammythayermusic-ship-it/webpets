//! Show it off (AFTER-BAKEOFF Step F2): save a clip of the pet or its card into Downloads and show it
//! in Finder, ready to drag into a chat. Nothing is uploaded; the app never posts anything itself.
//!
//! The bytes come as a raw IPC body (no base64 round trip for a few megabytes of video); the file
//! name comes in the `x-name` header and is kept to a safe shape.

use std::path::PathBuf;

use tauri::ipc::{InvokeBody, Request};

/// Bigger than any clip or card we make; anything larger is not ours.
const MAX_BYTES: usize = 40 * 1024 * 1024;
const EXTENSIONS: &[&str] = &["mp4", "webm", "png", "gif"];

/// "Bubbles-2026-11-03 10.42.mp4": letters, digits, spaces and - _ . only, a known extension.
fn safe_name(raw: &str) -> Option<String> {
    let name: String = raw.chars().filter(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.')).take(80).collect();
    let name = name.trim().trim_start_matches('.').to_string();
    let ext = name.rsplit('.').next()?.to_ascii_lowercase();
    if name.len() < 5 || !name.contains('.') || !EXTENSIONS.contains(&ext.as_str()) {
        return None;
    }
    Some(name)
}

/// The name, or "name 2.ext", "name 3.ext"... until it is free.
fn unique(dir: &std::path::Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = name.rsplit_once('.').unwrap_or((name, ""));
    (2..1000).map(|n| dir.join(format!("{stem} {n}.{ext}"))).find(|p| !p.exists()).unwrap_or(first)
}

#[tauri::command]
pub fn share_save(request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the file's bytes".into());
    };
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err("empty or too big".into());
    }
    let raw = request.headers().get("x-name").and_then(|v| v.to_str().ok()).unwrap_or("");
    let name = safe_name(raw).ok_or("not a file name we make")?;
    let home = std::env::var_os("HOME").ok_or("no home folder")?;
    let dir = PathBuf::from(home).join("Downloads");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = unique(&dir, &name);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    // Select it in Finder, so it is one drag from a chat.
    let _ = std::process::Command::new("/usr/bin/open").arg("-R").arg(&path).spawn();
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::safe_name;

    #[test]
    fn only_plain_names_with_our_extensions() {
        assert_eq!(safe_name("Bubbles 2026-11-03 10.42.mp4").as_deref(), Some("Bubbles 2026-11-03 10.42.mp4"));
        assert_eq!(safe_name("Pebble card.png").as_deref(), Some("Pebble card.png"));
        assert_eq!(safe_name("../../etc/passwd.png").as_deref(), Some("etcpasswd.png"));
        assert_eq!(safe_name("evil.app"), None);
        assert_eq!(safe_name("noext"), None);
        assert_eq!(safe_name(".png"), None);
    }
}
