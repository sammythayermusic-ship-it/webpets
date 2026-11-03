//! The world coming into the bowl (AFTER-BAKEOFF Step F): fetch a scoreboard or a news feed. Only
//! plain https GETs to a fixed list of free public hosts, no cookies, no keys, nothing sent but the
//! URL; the body comes back as text and the TypeScript brain reads it. The pet only ever talks about
//! what one of these fetches returned (src/brain/sports.ts, src/brain/news.ts).

use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(12);
/// A scoreboard or a feed is well under this; anything bigger is not what we asked for.
const MAX_BYTES: usize = 3 * 1024 * 1024;

/// Scoreboards (ESPN's public site API) and feel-good news feeds. Log a new one in DECISIONS.md.
const HOSTS: &[&str] = &[
    "site.api.espn.com",
    "www.goodnewsnetwork.org",
    "www.optimistdaily.com",
    "www.positive.news",
    "www.sciencedaily.com",
    "news.google.com",
];

fn allowed(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    HOSTS.contains(&host) && url.len() <= 2048 && !url.chars().any(|c| c.is_whitespace() || c.is_control())
}

#[tauri::command]
pub async fn world_fetch(url: String) -> Result<String, String> {
    if !allowed(&url) {
        return Err("not an allowed source".into());
    }
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent("WebPets/0.1 (desktop pet; macOS)")
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status().as_u16()));
    }
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > MAX_BYTES {
        return Err("too big".into());
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg(test)]
mod tests {
    use super::allowed;

    #[test]
    fn only_the_listed_sources() {
        assert!(allowed("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"));
        assert!(allowed("https://news.google.com/rss/search?q=dinosaurs&hl=en-US"));
        assert!(!allowed("http://site.api.espn.com/x"));
        assert!(!allowed("https://espn.com.evil.org/x"));
        assert!(!allowed("https://site.api.espn.com.evil.org/x"));
        assert!(!allowed("https://example.com/feed"));
        assert!(!allowed("https://news.google.com/rss?q=a b"));
    }
}
