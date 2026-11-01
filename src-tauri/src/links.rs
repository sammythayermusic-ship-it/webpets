//! Open a fact's source (or, later, a story) in the default browser when you tap the bubble.
//! Only plain https links to a real host; anything else is refused, so nothing the pet shows can
//! make the Mac open a file, an app or a custom URL scheme.

fn safe_https(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host_ok = !host.is_empty()
        && host.contains('.')
        && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
    host_ok && url.len() <= 2048 && !url.chars().any(|c| c.is_whitespace() || c.is_control())
}

#[tauri::command]
pub fn open_link(url: String) -> Result<(), String> {
    if !safe_https(&url) {
        return Err("not an https link".into());
    }
    std::process::Command::new("/usr/bin/open")
        .arg(&url)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::safe_https;

    #[test]
    fn only_plain_https_links_open() {
        assert!(safe_https("https://en.wikipedia.org/wiki/Goldfish"));
        assert!(safe_https("https://www.britannica.com/animal/goldfish#ref"));
        assert!(!safe_https("http://en.wikipedia.org/wiki/Goldfish"));
        assert!(!safe_https("file:///etc/passwd"));
        assert!(!safe_https("https://"));
        assert!(!safe_https("https://localhost/x"));
        assert!(!safe_https("https://evil.com/a b"));
        assert!(!safe_https("https://user@evil.com/"));
        assert!(!safe_https("-a Calculator"));
    }
}
