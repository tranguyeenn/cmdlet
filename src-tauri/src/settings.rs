//! App settings persisted in settings.json (iCloud synced).

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::storage;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_browser")]
    pub browser: String,
    #[serde(default = "default_true")]
    pub calendar_enabled: bool,
    #[serde(default = "default_true")]
    pub reminders_enabled: bool,
    #[serde(default = "default_true")]
    pub notes_enabled: bool,
    #[serde(default = "default_true")]
    pub due_reminders_enabled: bool,
    #[serde(default = "default_due_days_before")]
    pub due_reminder_days_before: u32,
    #[serde(default = "default_due_hour")]
    pub due_reminder_hour: u32,
    #[serde(default = "default_cmdlet_list")]
    pub cmdlet_reminder_list: String,
    #[serde(default = "default_true")]
    pub water_reminder_enabled: bool,
}

fn default_due_days_before() -> u32 {
    2
}

fn default_due_hour() -> u32 {
    9
}

fn default_cmdlet_list() -> String {
    "Cmdlet".into()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            browser: default_browser(),
            calendar_enabled: true,
            reminders_enabled: true,
            notes_enabled: true,
            due_reminders_enabled: true,
            due_reminder_days_before: default_due_days_before(),
            due_reminder_hour: default_due_hour(),
            cmdlet_reminder_list: default_cmdlet_list(),
            water_reminder_enabled: true,
        }
    }
}

fn default_browser() -> String {
    "Firefox".into()
}

fn default_true() -> bool {
    true
}

pub fn load_settings_from_disk(_app: &AppHandle) -> Result<AppSettings, String> {
    storage::read_json_value("settings.json")
}

fn write_settings(settings: &AppSettings) -> Result<(), String> {
    storage::write_json_value("settings.json", settings)
}

fn parse_bool(value: &str) -> Result<bool, String> {
    match value.to_lowercase().as_str() {
        "true" | "yes" | "on" | "1" => Ok(true),
        "false" | "no" | "off" | "0" => Ok(false),
        _ => Err(format!(
            "Invalid boolean value: {value}. Use true or false."
        )),
    }
}

/// Load persisted app settings.
#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    load_settings_from_disk(&app)
}

/// Update a single setting by key.
#[tauri::command]
pub fn update_setting(app: AppHandle, key: String, value: String) -> Result<AppSettings, String> {
    let mut settings = load_settings_from_disk(&app)?;
    let trimmed_key = key.trim().to_lowercase();
    let trimmed_value = value.trim();

    if trimmed_value.is_empty() {
        return Err("Setting value cannot be empty".into());
    }

    match trimmed_key.as_str() {
        "browser" => settings.browser = trimmed_value.to_string(),
        "calendarenabled" | "calendar_enabled" | "calendar" => {
            settings.calendar_enabled = parse_bool(trimmed_value)?
        }
        "remindersenabled" | "reminders_enabled" | "reminders" => {
            settings.reminders_enabled = parse_bool(trimmed_value)?
        }
        "notesenabled" | "notes_enabled" | "notes" => {
            settings.notes_enabled = parse_bool(trimmed_value)?
        }
        "dueremindersenabled" | "due_reminders_enabled" => {
            settings.due_reminders_enabled = parse_bool(trimmed_value)?
        }
        "duereminderdaysbefore" | "due_reminder_days_before" => {
            settings.due_reminder_days_before = trimmed_value
                .parse()
                .map_err(|_| format!("Invalid number: {trimmed_value}"))?
        }
        "duereminderhour" | "due_reminder_hour" => {
            settings.due_reminder_hour = trimmed_value
                .parse()
                .map_err(|_| format!("Invalid hour: {trimmed_value}"))?
        }
        "cmdletreminderlist" | "cmdlet_reminder_list" => {
            settings.cmdlet_reminder_list = trimmed_value.to_string()
        }
        "waterreminderenabled" | "water_reminder_enabled" => {
            settings.water_reminder_enabled = parse_bool(trimmed_value)?
        }
        _ => {
            return Err(format!(
                "Unknown setting: {key}. Available: browser, calendarEnabled, remindersEnabled, notesEnabled, dueRemindersEnabled, dueReminderDaysBefore, dueReminderHour, cmdletReminderList, waterReminderEnabled"
            ));
        }
    }

    write_settings(&settings)?;
    Ok(settings)
}

/// Replace all settings at once (used by the settings form).
#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    let _ = app;
    write_settings(&settings)?;
    Ok(settings)
}
