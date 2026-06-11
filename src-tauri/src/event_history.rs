//! Local history of recently created Apple Calendar events (max 20).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const MAX_HISTORY: usize = 20;
const FILE_NAME: &str = "event-history.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventHistoryEntry {
    pub id: String,
    pub title: String,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    pub calendar_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    pub repeat_rule: String,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apple_event_id: Option<String>,
}

pub fn load_history() -> Result<Vec<EventHistoryEntry>, String> {
    crate::storage::ensure_storage_ready()?;
    let path = crate::storage::icloud_storage_dir()?.join(FILE_NAME);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    if contents.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&contents).map_err(|error| format!("Invalid event history: {error}"))
}

pub fn append_history(entry: EventHistoryEntry) -> Result<(), String> {
    let mut history = load_history()?;
    history.insert(0, entry);
    history.truncate(MAX_HISTORY);
    crate::storage::write_json_value(FILE_NAME, &history)
}

fn titles_match(left: &str, right: &str) -> bool {
    left.trim().eq_ignore_ascii_case(right.trim())
}

/// Remove the most recent history entry matching the title.
pub fn remove_by_title(title: &str) -> Result<Option<EventHistoryEntry>, String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("Event title is required.".into());
    }

    let mut history = load_history()?;
    let index = history
        .iter()
        .position(|entry| titles_match(&entry.title, trimmed));

    let removed = match index {
        Some(index) => history.remove(index),
        None => return Ok(None),
    };

    crate::storage::write_json_value(FILE_NAME, &history)?;
    Ok(Some(removed))
}

pub fn record_created(
    title: String,
    start_at: DateTime<Utc>,
    end_at: DateTime<Utc>,
    calendar_name: String,
    location: Option<String>,
    repeat_rule: String,
    apple_event_id: Option<String>,
) -> Result<EventHistoryEntry, String> {
    let entry = EventHistoryEntry {
        id: Uuid::new_v4().to_string(),
        title,
        start_at,
        end_at,
        calendar_name,
        location,
        repeat_rule,
        created_at: Utc::now(),
        apple_event_id,
    };
    append_history(entry.clone())?;
    Ok(entry)
}
