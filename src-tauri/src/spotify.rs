//! Spotify search (Web API) and playback (AppleScript).

use std::fs;
use std::path::PathBuf;
use std::process::Command as ProcessCommand;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpotifyTrack {
    pub name: String,
    pub artist: String,
    pub uri: String,
}

#[derive(Debug, Deserialize)]
struct SpotifyCredentials {
    client_id: String,
    client_secret: String,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    tracks: TrackList,
}

#[derive(Debug, Deserialize)]
struct TrackList {
    items: Vec<ApiTrack>,
}

#[derive(Debug, Deserialize)]
struct ApiTrack {
    name: String,
    uri: String,
    artists: Vec<ApiArtist>,
}

#[derive(Debug, Deserialize)]
struct ApiArtist {
    name: String,
}

const SETUP_HINT: &str = "Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET env vars, or save them in spotify.json in the app data folder.";

fn credentials_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("spotify.json"))
}

fn load_credentials(app: &AppHandle) -> Result<(String, String), String> {
    if let (Ok(client_id), Ok(client_secret)) = (
        std::env::var("SPOTIFY_CLIENT_ID"),
        std::env::var("SPOTIFY_CLIENT_SECRET"),
    ) {
        if !client_id.is_empty() && !client_secret.is_empty() {
            return Ok((client_id, client_secret));
        }
    }

    let path = credentials_path(app)?;
    if !path.exists() {
        return Err(SETUP_HINT.into());
    }

    let contents = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let creds: SpotifyCredentials = serde_json::from_str(&contents)
        .map_err(|error| format!("Invalid spotify.json: {error}"))?;

    Ok((creds.client_id, creds.client_secret))
}

fn fetch_access_token(client_id: &str, client_secret: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::new();
    let response = client
        .post("https://accounts.spotify.com/api/token")
        .basic_auth(client_id, Some(client_secret))
        .form(&[("grant_type", "client_credentials")])
        .send()
        .map_err(|error| format!("Spotify auth failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Spotify auth failed ({}). Check your client ID and secret.",
            response.status()
        ));
    }

    let body: TokenResponse = response
        .json()
        .map_err(|error| format!("Spotify auth response invalid: {error}"))?;

    Ok(body.access_token)
}

fn run_osascript(script: &str) -> Result<String, String> {
    let output = ProcessCommand::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|error| format!("Failed to run osascript: {error}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Search Spotify for tracks matching the query (top 5).
#[tauri::command]
pub fn spotify_search(app: AppHandle, query: String) -> Result<Vec<SpotifyTrack>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Search query is required".into());
    }

    let (client_id, client_secret) = load_credentials(&app)?;
    let token = fetch_access_token(&client_id, &client_secret)?;

    let client = reqwest::blocking::Client::new();
    let response = client
        .get("https://api.spotify.com/v1/search")
        .bearer_auth(&token)
        .query(&[("q", trimmed), ("type", "track"), ("limit", "5")])
        .send()
        .map_err(|error| format!("Spotify search failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("Spotify search failed ({}).", response.status()));
    }

    let body: SearchResponse = response
        .json()
        .map_err(|error| format!("Spotify search response invalid: {error}"))?;

    let tracks = body
        .tracks
        .items
        .into_iter()
        .map(|track| SpotifyTrack {
            name: track.name,
            artist: track
                .artists
                .first()
                .map(|artist| artist.name.clone())
                .unwrap_or_else(|| "Unknown artist".into()),
            uri: track.uri,
        })
        .collect();

    Ok(tracks)
}

/// Play a Spotify track URI via the desktop app.
#[tauri::command]
pub fn spotify_play_track(uri: String) -> Result<String, String> {
    let trimmed = uri.trim();
    if trimmed.is_empty() {
        return Err("Track URI is required".into());
    }

    let escaped = trimmed.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        r#"tell application "Spotify"
    activate
    play track "{escaped}"
end tell"#
    );
    run_osascript(&script)?;

    Ok(format!("Playing {trimmed}"))
}
