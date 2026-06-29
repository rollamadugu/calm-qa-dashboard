// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;

// ===========================================================================
//  Credentials. These read from build-time environment variables so they can
//  be injected by GitHub Actions secrets and NEVER committed to the repo. If
//  you build locally and want to hardcode instead, replace the fallback string
//  after each `None =>`.
// ===========================================================================
const JIRA_BASE: &str = "https://southwest.atlassian.net";

const JIRA_EMAIL: &str = match option_env!("JIRA_EMAIL") {
    Some(v) => v,
    None => "PASTE_YOUR_JIRA_EMAIL_HERE",
};
const JIRA_TOKEN: &str = match option_env!("JIRA_TOKEN") {
    Some(v) => v,
    None => "PASTE_YOUR_API_TOKEN_HERE",
};
// ===========================================================================

fn auth_header() -> String {
    let raw = format!("{}:{}", JIRA_EMAIL, JIRA_TOKEN);
    format!("Basic {}", base64::engine::general_purpose::STANDARD.encode(raw))
}

#[tauri::command]
async fn jira_search(
    jql: String,
    fields: Vec<String>,
    next_page_token: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let mut body = serde_json::json!({
        "jql": jql,
        "fields": fields,
        "maxResults": 100
    });
    if let Some(t) = next_page_token {
        body["nextPageToken"] = serde_json::Value::String(t);
    }
    let resp = client
        .post(format!("{}/rest/api/3/search/jql", JIRA_BASE))
        .header("Authorization", auth_header())
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = resp.status();
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("bad JSON from Jira: {e}"))?;
    if !status.is_success() {
        return Err(format!("Jira returned {status}: {json}"));
    }
    Ok(json)
}

#[tauri::command]
async fn jira_group_members(group_id: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/rest/api/3/group/member?groupId={}&maxResults=200",
        JIRA_BASE, group_id
    );
    let resp = client
        .get(url)
        .header("Authorization", auth_header())
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    resp.json().await.map_err(|e| format!("bad JSON: {e}"))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![jira_search, jira_group_members])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
