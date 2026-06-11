//! Local history of recently created Apple Reminders (max 20).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const MAX_HISTORY: usize = 20;
const FILE_NAME: &str = "reminder-history.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReminderHistoryEntry {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_at: Option<DateTime<Utc>>,
    pub list_name: String,
    pub priority: String,
    pub repeat_rule: String,
    pub created_at: DateTime<Utc>,
}

pub fn load_history() -> Result<Vec<ReminderHistoryEntry>, String> {
    crate::storage::ensure_storage_ready()?;
    let path = crate::storage::icloud_storage_dir()?.join(FILE_NAME);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    if contents.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&contents).map_err(|error| format!("Invalid reminder history: {error}"))
}

pub fn append_history(entry: ReminderHistoryEntry) -> Result<(), String> {
    let mut history = load_history()?;
    history.insert(0, entry);
    history.truncate(MAX_HISTORY);
    crate::storage::write_json_value(FILE_NAME, &history)
}

fn titles_match(left: &str, right: &str) -> bool {
    left.trim().eq_ignore_ascii_case(right.trim())
}

/// Remove the most recent history entry matching the title.
pub fn remove_by_title(title: &str) -> Result<Option<ReminderHistoryEntry>, String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("Reminder title is required.".into());
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
    notes: Option<String>,
    due_at: Option<DateTime<Utc>>,
    list_name: String,
    priority: String,
    repeat_rule: String,
) -> Result<ReminderHistoryEntry, String> {
    let entry = ReminderHistoryEntry {
        id: Uuid::new_v4().to_string(),
        title,
        notes,
        due_at,
        list_name,
        priority,
        repeat_rule,
        created_at: Utc::now(),
    };
    append_history(entry.clone())?;
    Ok(entry)
}
