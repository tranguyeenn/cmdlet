//! iCloud Drive synced JSON storage for Cmdlet user data.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{de::DeserializeOwned, Serialize};
use tauri::{AppHandle, Manager};

const ICLOUD_RELATIVE_DIR: &str = "Library/Mobile Documents/com~apple~CloudDocs/Cmdlet";

const PLANNER_DEFAULT: &str = r#"{
  "classes": [],
  "assignments": [],
  "exams": [],
  "notes": []
}"#;

const SETTINGS_DEFAULT: &str = r#"{
  "browser": "Firefox",
  "calendarEnabled": true,
  "remindersEnabled": true,
  "notesEnabled": true,
  "dueRemindersEnabled": true,
  "dueReminderDaysBefore": 2,
  "dueReminderHour": 9,
  "cmdletReminderList": "Cmdlet",
  "waterReminderEnabled": true
}"#;

const ALLOWED_FILES: &[&str] = &[
    "tasks.json",
    "quicklinks.json",
    "books.json",
    "planner.json",
    "settings.json",
    "planner-export.json",
    "event-history.json",
    "reminder-history.json",
    "note-history.json",
];

pub fn icloud_storage_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    Ok(PathBuf::from(home).join(ICLOUD_RELATIVE_DIR))
}

pub fn legacy_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

pub fn planner_default_json() -> &'static str {
    PLANNER_DEFAULT
}

pub fn settings_default_json() -> &'static str {
    SETTINGS_DEFAULT
}

fn validate_file_name(file_name: &str) -> Result<(), String> {
    if ALLOWED_FILES.contains(&file_name) {
        Ok(())
    } else {
        Err(format!("Unsupported storage file: {file_name}"))
    }
}

fn init_file_if_missing(dir: &Path, file_name: &str, default_contents: &str) -> Result<(), String> {
    validate_file_name(file_name)?;
    let path = dir.join(file_name);
    if path.exists() {
        return Ok(());
    }

    fs::write(&path, default_contents)
        .map_err(|error| format!("Failed to create {file_name} in iCloud Cmdlet folder: {error}"))
}

/// Ensure the iCloud Cmdlet folder exists with default JSON files.
pub fn ensure_storage_ready() -> Result<PathBuf, String> {
    let dir = icloud_storage_dir()?;
    fs::create_dir_all(&dir).map_err(|error| {
        format!(
            "Could not create iCloud Cmdlet folder at {}. Check that iCloud Drive is enabled: {error}",
            dir.display()
        )
    })?;

    init_file_if_missing(&dir, "tasks.json", "[]")?;
    init_file_if_missing(&dir, "quicklinks.json", "[]")?;
    init_file_if_missing(&dir, "books.json", "[]")?;
    init_file_if_missing(&dir, "planner.json", PLANNER_DEFAULT)?;
    init_file_if_missing(&dir, "settings.json", SETTINGS_DEFAULT)?;
    init_file_if_missing(&dir, "event-history.json", "[]")?;
    init_file_if_missing(&dir, "reminder-history.json", "[]")?;
    init_file_if_missing(&dir, "note-history.json", "[]")?;

    Ok(dir)
}

/// Read a JSON file from iCloud storage.
pub fn read_json(file_name: &str) -> Result<String, String> {
    validate_file_name(file_name)?;
    let dir = ensure_storage_ready()?;
    let path = dir.join(file_name);

    if !path.exists() {
        return Err(format!("Missing storage file: {file_name}"));
    }

    fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read {file_name} from iCloud storage: {error}"))
}

/// Write raw JSON contents to iCloud storage.
pub fn write_json(file_name: &str, contents: &str) -> Result<(), String> {
    validate_file_name(file_name)?;
    let dir = ensure_storage_ready()?;
    let path = dir.join(file_name);

    fs::write(&path, contents)
        .map_err(|error| format!("Failed to write {file_name} to iCloud storage: {error}"))
}

pub fn read_json_value<T: DeserializeOwned>(file_name: &str) -> Result<T, String> {
    let contents = read_json(file_name)?;
    if contents.trim().is_empty() {
        return Err(format!("Storage file is empty: {file_name}"));
    }

    serde_json::from_str(&contents).map_err(|error| format!("Invalid JSON in {file_name}: {error}"))
}

pub fn write_json_value<T: Serialize + ?Sized>(file_name: &str, value: &T) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    write_json(file_name, &contents)
}

fn file_has_user_data(path: &Path, empty_marker: &str) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }

    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    Ok(!contents.trim().is_empty() && contents.trim() != empty_marker)
}

pub fn migrate_json_file_if_needed(
    icloud_dir: &Path,
    legacy_dir: &Path,
    file_name: &str,
    empty_marker: &str,
) -> Result<(), String> {
    let icloud_path = icloud_dir.join(file_name);
    let legacy_path = legacy_dir.join(file_name);

    if file_has_user_data(&icloud_path, empty_marker)? {
        return Ok(());
    }

    if !legacy_path.exists() {
        return Ok(());
    }

    let legacy_contents = fs::read_to_string(&legacy_path).map_err(|error| error.to_string())?;
    if legacy_contents.trim().is_empty() || legacy_contents.trim() == empty_marker {
        return Ok(());
    }

    fs::write(&icloud_path, legacy_contents).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn read_legacy_json<T: DeserializeOwned>(path: &Path) -> Result<Vec<T>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    if contents.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

/// Copy legacy local app data into iCloud storage when iCloud files are still empty.
pub fn migrate_from_legacy(app: &AppHandle) -> Result<(), String> {
    let icloud_dir = ensure_storage_ready()?;
    let legacy_dir = legacy_app_data_dir(app)?;

    if !legacy_dir.exists() {
        return Ok(());
    }

    migrate_json_file_if_needed(&icloud_dir, &legacy_dir, "tasks.json", "[]")?;
    migrate_json_file_if_needed(&icloud_dir, &legacy_dir, "books.json", "[]")?;
    migrate_json_file_if_needed(&icloud_dir, &legacy_dir, "settings.json", SETTINGS_DEFAULT)?;
    crate::planner_data::migrate_planner_from_legacy(&legacy_dir)?;

    Ok(())
}

#[tauri::command]
pub fn ensure_storage_ready_command() -> Result<String, String> {
    let dir = ensure_storage_ready()?;
    Ok(dir.display().to_string())
}

#[tauri::command]
pub fn read_json_command(file_name: String) -> Result<String, String> {
    read_json(&file_name)
}

#[tauri::command]
pub fn write_json_command(file_name: String, contents: String) -> Result<(), String> {
    write_json(&file_name, &contents)
}
