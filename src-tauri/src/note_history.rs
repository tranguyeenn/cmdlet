//! Local history of recently created Apple Notes (max 20).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const MAX_HISTORY: usize = 20;
const FILE_NAME: &str = "note-history.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteHistoryEntry {
    pub id: String,
    pub title: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
}

pub fn load_history() -> Result<Vec<NoteHistoryEntry>, String> {
    crate::storage::ensure_storage_ready()?;
    let path = crate::storage::icloud_storage_dir()?.join(FILE_NAME);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    if contents.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&contents).map_err(|error| format!("Invalid note history: {error}"))
}

pub fn append_history(entry: NoteHistoryEntry) -> Result<(), String> {
    let mut history = load_history()?;
    history.insert(0, entry);
    history.truncate(MAX_HISTORY);
    crate::storage::write_json_value(FILE_NAME, &history)
}

pub fn record_created(title: String, content: String) -> Result<NoteHistoryEntry, String> {
    let entry = NoteHistoryEntry {
        id: Uuid::new_v4().to_string(),
        title,
        content,
        created_at: Utc::now(),
    };
    append_history(entry.clone())?;
    Ok(entry)
}
