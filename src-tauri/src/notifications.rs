//! macOS native notifications via AppleScript.

use std::process::Command as ProcessCommand;

fn escape_applescript_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn run_osascript(script: &str) -> Result<(), String> {
    let output = ProcessCommand::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|error| format!("Failed to run osascript: {error}"))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Show a macOS notification banner (Notification Center).
pub fn show_notification(title: &str, body: &str) -> Result<(), String> {
    let title = escape_applescript_string(title);
    let body = escape_applescript_string(body);
    let script = format!("display notification \"{body}\" with title \"{title}\"");
    run_osascript(&script)
}

/// Show an alert that breaks through Do Not Disturb / Focus (and a sleeping
/// display).
///
/// Focus silences Notification Center banners and their sounds, so a plain
/// `display notification` is suppressed. This instead uses channels Focus does
/// not gate:
/// - `caffeinate -u` declares user activity, waking the display if it slept.
/// - `afplay` plays a sound directly; direct audio playback is not silenced by
///   Focus the way a notification's own sound is.
/// - `display dialog` renders a modal window that appears on top of Focus,
///   unlike a banner. It auto-dismisses after 60s so it never blocks forever.
///
/// Note: this cannot wake a Mac from full *system* sleep — no process runs
/// then. It handles display sleep and Do Not Disturb.
pub fn show_urgent_notification(title: &str, body: &str) -> Result<(), String> {
    // Wake the display if asleep; non-blocking and self-terminating.
    let _ = ProcessCommand::new("caffeinate")
        .args(["-u", "-t", "5"])
        .spawn();

    // Play a sound; not gated by Focus the way notification sounds are.
    let _ = ProcessCommand::new("afplay")
        .arg("/System/Library/Sounds/Sosumi.aiff")
        .spawn();

    let title = escape_applescript_string(title);
    let body = escape_applescript_string(body);
    let script = format!(
        "display dialog \"{body}\" with title \"{title}\" with icon caution buttons {{\"OK\"}} default button 1 giving up after 60"
    );
    run_osascript(&script)
}

/// Show a macOS notification from the frontend.
///
/// When `urgent` is true the alert breaks through Do Not Disturb / Focus via
/// [`show_urgent_notification`]; otherwise it shows a normal banner.
#[tauri::command]
pub fn notify(title: String, body: String, urgent: Option<bool>) -> Result<(), String> {
    let title = title.trim();
    let body = body.trim();
    if title.is_empty() {
        return Err("Notification title is required".into());
    }
    if urgent.unwrap_or(false) {
        show_urgent_notification(title, body)
    } else {
        show_notification(title, body)
    }
}
