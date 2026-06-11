//! Apple Notes integration via osascript.

use std::process::Command as ProcessCommand;

use serde::{Deserialize, Serialize};

use crate::note_history::{self, NoteHistoryEntry};

pub const CMDLET_NOTES_FOLDER: &str = "Cmdlet Notes";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNotePayload {
    pub title: String,
    pub content: String,
    #[serde(default)]
    pub append_to_existing: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteResponse {
    pub id: String,
    pub message: String,
}

fn escape_applescript(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
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
        Err(map_notes_error(
            &String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ))
    }
}

fn map_notes_error(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("not authorized")
        || lower.contains("authorization")
        || lower.contains("-1743")
    {
        return "Notes access denied. Open System Settings > Privacy & Security > Notes and allow Cmdlet."
            .into();
    }
    if raw.trim().is_empty() {
        return "Apple Notes is unavailable.".into();
    }
    raw.to_string()
}

fn ensure_folder_script(folder: &str) -> String {
    let safe_folder = escape_applescript(folder);
    format!(
        r#"tell application "Notes"
  set folderNames to name of every folder
  if folderNames does not contain "{safe_folder}" then
    make new folder with properties {{name:"{safe_folder}"}}
  end if
end tell"#
    )
}

#[tauri::command]
pub fn create_note(payload: CreateNotePayload) -> Result<CreateNoteResponse, String> {
    let title = payload.title.trim();
    if title.is_empty() {
        return Err("Note title is required.".into());
    }

    let content = payload.content.trim();
    if content.is_empty() {
        return Err("Note content is required.".into());
    }

    let safe_title = escape_applescript(title);
    let safe_content = escape_applescript(content);
    let safe_folder = escape_applescript(CMDLET_NOTES_FOLDER);

    run_osascript(&ensure_folder_script(CMDLET_NOTES_FOLDER))?;

    let script = if payload.append_to_existing {
        format!(
            r#"tell application "Notes"
  tell folder "{safe_folder}"
    set matches to every note whose name is "{safe_title}"
    if (count of matches) > 0 then
      set targetNote to item 1 of matches
      set body of targetNote to (body of targetNote) & linefeed & linefeed & "{safe_content}"
    else
      make new note with properties {{name:"{safe_title}", body:"{safe_content}"}}
    end if
  end tell
end tell"#
        )
    } else {
        format!(
            r#"tell application "Notes"
  tell folder "{safe_folder}"
    make new note with properties {{name:"{safe_title}", body:"{safe_content}"}}
  end tell
end tell"#
        )
    };

    run_osascript(&script)?;

    let history = note_history::record_created(title.to_string(), content.to_string())?;

    Ok(CreateNoteResponse {
        id: history.id,
        message: format!("Created in Apple Notes ({CMDLET_NOTES_FOLDER})"),
    })
}

#[tauri::command]
pub fn get_note_history() -> Result<Vec<NoteHistoryEntry>, String> {
    note_history::load_history()
}
