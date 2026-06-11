//! Apple Calendar integration via osascript.

use std::process::Command as ProcessCommand;

use chrono::{DateTime, Datelike, Local, Timelike, Utc};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::event_history::{self, EventHistoryEntry};

pub const CMDLET_CALENDAR_NAME: &str = "Cmdlet";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CalendarInfo {
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAppleEventPayload {
    pub title: String,
    pub start_at: String,
    pub end_at: String,
    pub calendar_name: String,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub repeat_rule: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAppleEventResponse {
    pub id: String,
    pub apple_event_id: Option<String>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteEventPayload {
    pub title: String,
    #[serde(default)]
    pub calendar_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteEventResponse {
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
        Err(map_calendar_error(
            &String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ))
    }
}

fn map_calendar_error(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("not authorized")
        || lower.contains("authorization")
        || lower.contains("-1743")
        || lower.contains("access for")
    {
        return "Calendar access denied. Open System Settings > Privacy & Security > Calendar and allow Cmdlet."
            .into();
    }
    if lower.contains("calendar got an error") && lower.contains("can't get calendar") {
        return "Calendar not found. Pick a different calendar from the list.".into();
    }
    if raw.trim().is_empty() {
        return "Apple Calendar is unavailable.".into();
    }
    raw.to_string()
}

fn build_apple_date_literal(name: &str, date: DateTime<Local>) -> String {
    format!(
        "set {name} to current date\n\
         set year of {name} to {year}\n\
         set month of {name} to {month}\n\
         set day of {name} to {day}\n\
         set hours of {name} to {hour}\n\
         set minutes of {name} to {minute}\n\
         set seconds of {name} to 0",
        name = name,
        year = date.year(),
        month = date.month(),
        day = date.day(),
        hour = date.hour(),
        minute = date.minute(),
    )
}

fn parse_instant(value: &str) -> Result<DateTime<Local>, String> {
    DateTime::parse_from_rfc3339(value)
        .map(|instant| instant.with_timezone(&Local))
        .map_err(|_| "Invalid date or time.".into())
}

fn recurrence_rrule(repeat_rule: &str) -> Option<&'static str> {
    match repeat_rule.to_lowercase().as_str() {
        "daily" => Some("FREQ=DAILY;INTERVAL=1"),
        "weekly" => Some("FREQ=WEEKLY;INTERVAL=1"),
        "monthly" => Some("FREQ=MONTHLY;INTERVAL=1"),
        _ => None,
    }
}

fn calendar_list_script() -> String {
    r#"tell application "Calendar"
  set names to {}
  repeat with cal in calendars
    set end of names to name of cal
  end repeat
  set AppleScript's text item delimiters to linefeed
  return names as text
end tell"#
        .into()
}

#[tauri::command]
pub fn get_calendars() -> Result<Vec<CalendarInfo>, String> {
    let output = run_osascript(&calendar_list_script())?;
    let calendars: Vec<CalendarInfo> = output
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(|name| CalendarInfo {
            name: name.to_string(),
        })
        .collect();

    if calendars.is_empty() {
        return Err("No calendars found. Open Apple Calendar and try again.".into());
    }

    Ok(calendars)
}

#[tauri::command]
pub fn check_cmdlet_calendar_exists() -> Result<bool, String> {
    let script = format!(
        r#"tell application "Calendar"
  repeat with cal in calendars
    if name of cal is "{CMDLET_CALENDAR_NAME}" then return "true"
  end repeat
  return "false"
end tell"#
    );
    Ok(run_osascript(&script)? == "true")
}

#[tauri::command]
pub fn create_cmdlet_calendar() -> Result<String, String> {
    if check_cmdlet_calendar_exists()? {
        return Ok(format!("{CMDLET_CALENDAR_NAME} calendar already exists."));
    }

    let script = format!(
        r#"tell application "Calendar"
  make new calendar with properties {{name:"{CMDLET_CALENDAR_NAME}"}}
end tell"#
    );
    run_osascript(&script)?;
    Ok(format!("Created {CMDLET_CALENDAR_NAME} calendar."))
}

fn create_apple_event(
    payload: &CreateAppleEventPayload,
    start: DateTime<Local>,
    end: DateTime<Local>,
) -> Result<String, String> {
    let title = payload.title.trim();
    if title.is_empty() {
        return Err("Event title is required.".into());
    }

    let calendar_name = payload.calendar_name.trim();
    if calendar_name.is_empty() {
        return Err("Calendar is required.".into());
    }

    if end <= start {
        return Err("End time must be after start time.".into());
    }

    let safe_title = escape_applescript(title);
    let safe_calendar = escape_applescript(calendar_name);
    let start_literal = build_apple_date_literal("startDate", start);
    let end_literal = build_apple_date_literal("endDate", end);

    let mut props = vec![
        format!("summary:\"{safe_title}\""),
        "start date:startDate".into(),
        "end date:endDate".into(),
    ];

    if let Some(location) = payload
        .location
        .as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    {
        props.push(format!("location:\"{}\"", escape_applescript(location)));
    }

    if let Some(notes) = payload
        .notes
        .as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    {
        props.push(format!("description:\"{}\"", escape_applescript(notes)));
    }

    let repeat_rule = payload.repeat_rule.as_deref().unwrap_or("none");
    if let Some(rrule) = recurrence_rrule(repeat_rule) {
        props.push(format!("recurrence:\"{}\"", escape_applescript(rrule)));
    }

    let props_text = props.join(", ");
    let script = format!(
        r#"{start_literal}
{end_literal}
tell application "Calendar"
  set targetCalendar to calendar "{safe_calendar}"
  tell targetCalendar
    set newEvent to make new event with properties {{{props_text}}}
    return uid of newEvent
  end tell
end tell"#
    );

    run_osascript(&script)
}

fn delete_apple_event_by_uid(calendar_name: &str, uid: &str) -> Result<(), String> {
    let safe_calendar = escape_applescript(calendar_name.trim());
    let safe_uid = escape_applescript(uid.trim());

    let script = format!(
        r#"tell application "Calendar"
  tell calendar "{safe_calendar}"
    set matches to (every event whose uid is "{safe_uid}")
    if (count of matches) is 0 then error "Event not found."
    repeat with e in matches
      delete e
    end repeat
  end tell
end tell"#
    );

    run_osascript(&script).map(|_| ())
}

fn delete_apple_event_by_title(calendar_name: &str, title: &str) -> Result<(), String> {
    let safe_calendar = escape_applescript(calendar_name.trim());
    let safe_title = escape_applescript(title.trim());

    let script = format!(
        r#"tell application "Calendar"
  tell calendar "{safe_calendar}"
    set matches to (every event whose summary is "{safe_title}")
    if (count of matches) is 0 then error "Event not found."
    repeat with e in matches
      delete e
    end repeat
  end tell
end tell"#
    );

    run_osascript(&script).map(|_| ())
}

#[tauri::command]
pub fn create_event(
    _app: AppHandle,
    payload: CreateAppleEventPayload,
) -> Result<CreateAppleEventResponse, String> {
    let start_local = parse_instant(&payload.start_at)?;
    let end_local = parse_instant(&payload.end_at)?;
    let repeat_rule = payload.repeat_rule.clone().unwrap_or_else(|| "none".into());
    let calendar_name = {
        let trimmed = payload.calendar_name.trim();
        if trimmed.is_empty() {
            "Local".to_string()
        } else {
            trimmed.to_string()
        }
    };

    let history = event_history::record_created(
        payload.title.trim().to_string(),
        start_local.with_timezone(&Utc),
        end_local.with_timezone(&Utc),
        calendar_name,
        payload
            .location
            .as_ref()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty()),
        repeat_rule,
        None,
    )?;

    Ok(CreateAppleEventResponse {
        id: history.id,
        apple_event_id: None,
        message: "Created event (local)".into(),
    })
}

#[tauri::command]
pub fn get_event_history() -> Result<Vec<EventHistoryEntry>, String> {
    event_history::load_history()
}

#[tauri::command]
pub fn delete_event(payload: DeleteEventPayload) -> Result<DeleteEventResponse, String> {
    let title = payload.title.trim();
    if title.is_empty() {
        return Err("Event title is required.".into());
    }

    let history_entry = event_history::remove_by_title(title)?;
    match history_entry {
        Some(_) => Ok(DeleteEventResponse {
            message: format!("Deleted event: {title}"),
        }),
        None => Err("Event not found.".into()),
    }
}
