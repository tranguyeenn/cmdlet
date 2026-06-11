//! Local task storage in tasks.json (iCloud Cmdlet folder).

use chrono::{DateTime, Local, Utc};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use crate::storage;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskEntry {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskPayload {
    pub title: String,
    #[serde(default)]
    pub due_at: Option<String>,
}

fn load_tasks() -> Result<Vec<TaskEntry>, String> {
    storage::read_json_value("tasks.json")
}

fn write_tasks(tasks: &[TaskEntry]) -> Result<(), String> {
    storage::write_json_value("tasks.json", tasks)
}

/// Create a task in local storage only.
#[tauri::command]
pub fn create_task(_app: AppHandle, payload: CreateTaskPayload) -> Result<String, String> {
    let title = payload.title.trim();
    if title.is_empty() {
        return Err("Task title is required".into());
    }

    let due_at = match payload.due_at {
        Some(value) if !value.trim().is_empty() => Some(
            DateTime::parse_from_rfc3339(&value)
                .map_err(|error| error.to_string())?
                .with_timezone(&Utc),
        ),
        _ => None,
    };

    let entry = TaskEntry {
        id: Uuid::new_v4().to_string(),
        title: title.to_string(),
        due_at,
        created_at: Utc::now(),
    };

    let mut tasks = load_tasks()?;
    tasks.push(entry);
    write_tasks(&tasks)?;

    let mut message = format!("Saved task: {title}");
    if let Some(due) = due_at {
        let local: DateTime<Local> = due.with_timezone(&Local);
        message.push_str(&format!(" (due {})", local.format("%b %-d, %H:%M")));
    }

    Ok(message)
}

/// Load all saved tasks.
#[tauri::command]
pub fn load_tasks_command(_app: AppHandle) -> Result<Vec<TaskEntry>, String> {
    load_tasks()
}
