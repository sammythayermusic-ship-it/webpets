//! Claude-written lines (AFTER-BAKEOFF Step D.2).
//!
//! The API key lives in the macOS Keychain (a generic password, service `com.sammythayer.webpets`,
//! account `anthropic`) and never leaves this process: the webview sends the prompt it built
//! (src/brain/writer.ts), Rust adds the key, calls the Messages API, and hands back only the line and
//! what it cost. No key, no network, a refusal or anything unexpected: `text` is `None` and the pet
//! says a line from its built-in library instead.

use serde::Serialize;
use serde_json::{json, Value};
use std::time::Duration;

const KEYCHAIN_SERVICE: &str = "com.sammythayer.webpets";
const KEYCHAIN_ACCOUNT: &str = "anthropic";
const ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
const MODEL: &str = "claude-opus-5-5";
const API_VERSION: &str = "2026-10-21";
/// Refusals re-run on a fallback model chosen by the API (`fallbacks: "default"`).
const FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";
/// A line is short, but the model thinks first (thinking cannot be turned off on this model), and
/// that thinking counts toward the limit; low effort keeps it brief.
const MAX_TOKENS: u32 = 1024;
const TIMEOUT: Duration = Duration::from_secs(25);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceStatus {
    has_key: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WrittenLine {
    /// The line, or `None` when nothing usable came back (refused, empty, cut off).
    text: Option<String>,
    /// What the request cost in US dollars, for the daily cap (also charged when `text` is `None`).
    usd: f64,
}

fn api_key() -> Option<String> {
    let bytes = security_framework::passwords::get_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).ok()?;
    let key = String::from_utf8(bytes).ok()?.trim().to_string();
    if key.is_empty() {
        None
    } else {
        Some(key)
    }
}

#[tauri::command]
pub fn voice_status() -> VoiceStatus {
    VoiceStatus { has_key: api_key().is_some() }
}

/// US dollars per million tokens (input, output) for the model that served the request. Anything not
/// listed is priced at the top of the range, so the cap can only be reached early, never overshot.
fn rates(model: &str) -> (f64, f64) {
    match model {
        "claude-opus-5-5" => (4.0, 20.0),
        "claude-opus-5" | "claude-opus-4-8" | "claude-opus-4-7" | "claude-opus-4-6" => (5.0, 25.0),
        "claude-sonnet-5-5" | "claude-sonnet-5" => (2.0, 10.0),
        _ => (10.0, 50.0),
    }
}

fn cost(resp: &Value) -> f64 {
    let model = resp["model"].as_str().unwrap_or("");
    let (input, output) = rates(model);
    let u = &resp["usage"];
    let n = |k: &str| u[k].as_f64().unwrap_or(0.0);
    let input_usd = (n("input_tokens") + 1.25 * n("cache_creation_input_tokens") + 0.1 * n("cache_read_input_tokens")) * input;
    (input_usd + n("output_tokens") * output) / 1_000_000.0
}

/// The text of a Messages API response, or `None` unless it finished normally with some text.
fn line_of(resp: &Value) -> Option<String> {
    if resp["stop_reason"].as_str() != Some("end_turn") {
        return None;
    }
    let text: String = resp["content"]
        .as_array()?
        .iter()
        .filter(|b| b["type"].as_str() == Some("text"))
        .filter_map(|b| b["text"].as_str())
        .collect::<Vec<_>>()
        .join(" ");
    let text = text.trim();
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

fn request_body(system: &str, user: &str) -> Value {
    json!({
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "output_config": { "effort": "low" },
        "fallbacks": "default",
        "system": system,
        "messages": [{ "role": "user", "content": user }],
    })
}

#[tauri::command]
pub async fn voice_write(system: String, user: String) -> Result<WrittenLine, String> {
    let Some(key) = api_key() else {
        return Ok(WrittenLine { text: None, usd: 0.0 });
    };
    let client = reqwest::Client::builder().timeout(TIMEOUT).build().map_err(|e| e.to_string())?;
    let resp = client
        .post(ENDPOINT)
        .header("x-api-key", key)
        .header("anthropic-version", API_VERSION)
        .header("anthropic-beta", FALLBACK_BETA)
        .header("content-type", "application/json")
        .json(&request_body(&system, &user))
        .send()
        .await
        .map_err(|e| format!("request failed: {}", e.without_url()))?;
    let status = resp.status();
    let body: Value = resp.json().await.map_err(|e| format!("bad response: {}", e.without_url()))?;
    if !status.is_success() {
        let kind = body["error"]["type"].as_str().unwrap_or("unknown");
        return Err(format!("api error {}: {}", status.as_u16(), kind));
    }
    Ok(WrittenLine { text: line_of(&body), usd: cost(&body) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_text_of_a_normal_reply() {
        let r = json!({
            "model": "claude-opus-5-5",
            "stop_reason": "end_turn",
            "content": [{ "type": "thinking", "thinking": "" }, { "type": "text", "text": " The plant waved at me. " }],
            "usage": { "input_tokens": 400, "output_tokens": 100 },
        });
        assert_eq!(line_of(&r).as_deref(), Some("The plant waved at me."));
        assert!((cost(&r) - (400.0 * 4.0 + 100.0 * 20.0) / 1e6).abs() < 1e-12);
    }

    #[test]
    fn nothing_from_a_refusal_or_a_cut_off_reply_but_it_still_costs() {
        for stop in ["refusal", "max_tokens"] {
            let r = json!({
                "model": "claude-opus-5-5",
                "stop_reason": stop,
                "content": [{ "type": "text", "text": "Half a li" }],
                "usage": { "input_tokens": 400, "output_tokens": 1024 },
            });
            assert_eq!(line_of(&r), None);
            assert!(cost(&r) > 0.0);
        }
    }

    #[test]
    fn an_unknown_model_is_priced_high_so_the_cap_never_overshoots() {
        let r = json!({ "model": "something-new", "usage": { "input_tokens": 1000000, "output_tokens": 0 } });
        assert_eq!(cost(&r), 10.0);
    }

    #[test]
    fn the_request_asks_for_low_effort_and_default_fallbacks() {
        let b = request_body("sys", "hi");
        assert_eq!(b["model"], MODEL);
        assert_eq!(b["output_config"]["effort"], "low");
        assert_eq!(b["fallbacks"], "default");
        assert!(b.get("temperature").is_none());
        assert_eq!(b["messages"][0]["content"], "hi");
    }
}
