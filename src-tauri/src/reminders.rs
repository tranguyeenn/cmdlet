//! Apple Reminders integration via osascript.

use std::process::Command as ProcessCommand;

use chrono::{DateTime, Datelike, Local, Timelike, Utc, TimeZone};
use serde::{Deserialize, Serialize};

use crate::reminder_history::{self, ReminderHistoryEntry};

pub const DEFAULT_REMINDER_LIST: &str = "Reminders";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReminderListInfo {
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReminderPayload {
    pub title: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub due_at: Option<String>,
    #[serde(default)]
    pub list_name: Option<String>,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub repeat_rule: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReminderResponse {
    pub id: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteReminderPayload {
    pub title: String,
    #[serde(default)]
    pub list_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteReminderResponse {
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReminderInfo {
    pub title: String,
    pub notes: String,
    pub due_at_local: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListRemindersPayload {
    pub list_name: String,
    #[serde(default)]
    pub title_prefix: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReminderPayload {
    pub title: String,
    pub new_title: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub due_at: Option<String>,
    #[serde(default)]
    pub list_name: Option<String>,
    #[serde(default)]
    pub repeat_rule: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReminderResponse {
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
        Err(map_reminders_error(
            &String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ))
    }
}

fn map_reminders_error(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("not authorized")
        || lower.contains("authorization")
        || lower.contains("-1743")
    {
        return "Reminders access denied. Open System Settings > Privacy & Security > Reminders and allow Cmdlet."
            .into();
    }
    if lower.contains("can't get list") {
        return "Reminder list not found. Pick a different list.".into();
    }
    if raw.trim().is_empty() {
        return "Apple Reminders is unavailable.".into();
    }
    raw.to_string()
}

fn priority_value(priority: &str) -> i32 {
    match priority.to_lowercase().as_str() {
        "high" => 1,
        "medium" => 5,
        "low" => 9,
        _ => 0,
    }
}

fn recurrence_rrule(repeat_rule: &str) -> Option<&'static str> {
    match repeat_rule.to_lowercase().as_str() {
        "daily" => Some("FREQ=DAILY;INTERVAL=1"),
        "weekly" => Some("FREQ=WEEKLY;INTERVAL=1"),
        "monthly" => Some("FREQ=MONTHLY;INTERVAL=1"),
        _ => None,
    }
}

fn build_due_date_literal(due: DateTime<Local>) -> String {
    format!(
        "set dueDate to current date\n\
         set year of dueDate to {year}\n\
         set month of dueDate to {month}\n\
         set day of dueDate to {day}\n\
         set hours of dueDate to {hour}\n\
         set minutes of dueDate to {minute}\n\
         set seconds of dueDate to 0",
        year = due.year(),
        month = due.month(),
        day = due.day(),
        hour = due.hour(),
        minute = due.minute(),
    )
}

fn parse_due_local(value: &Option<String>) -> Result<Option<DateTime<Local>>, String> {
    use chrono::NaiveDate;

    value
        .as_ref()
        .filter(|v| !v.trim().is_empty())
        .map(|due_at| {
            // Try RFC3339 first (timestamp with offset)
            if let Ok(dt) = DateTime::parse_from_rfc3339(due_at) {
                return Ok(dt.with_timezone(&Local));
            }
            // Next, accept date-only strings like YYYY-MM-DD and treat them as
            // local midday (12:00) to represent an all-day reminder without
            // risking timezone rollover.
            if let Ok(naive) = NaiveDate::parse_from_str(due_at, "%Y-%m-%d") {
                // construct a Local DateTime at noon
                let local_dt = Local
                    .ymd(naive.year(), naive.month(), naive.day())
                    .and_hms(12, 0, 0);
                return Ok(local_dt);
            }
            Err("Invalid due date or time.".to_string())
        })
        .transpose()
}

#[tauri::command]
pub fn get_reminder_lists() -> Result<Vec<ReminderListInfo>, String> {
    let script = r#"tell application "Reminders"
  set names to {}
  repeat with l in lists
    set end of names to name of l
  end repeat
  set AppleScript's text item delimiters to linefeed
  return names as text
end tell"#;

    let output = run_osascript(script)?;
    let lists: Vec<ReminderListInfo> = output
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(|name| ReminderListInfo {
            name: name.to_string(),
        })
        .collect();

    if lists.is_empty() {
        return Err("No reminder lists found. Open Apple Reminders and try again.".into());
    }

    Ok(lists)
}

fn create_apple_reminder(payload: &CreateReminderPayload) -> Result<(), String> {
    let title = payload.title.trim();
    if title.is_empty() {
        return Err("Reminder title is required.".into());
    }

    let list_name = payload
        .list_name
        .as_deref()
        .unwrap_or(DEFAULT_REMINDER_LIST)
        .trim();
    if list_name.is_empty() {
        return Err("Reminder list is required.".into());
    }

    let safe_title = escape_applescript(title);
    let safe_list = escape_applescript(list_name);
    let priority = priority_value(payload.priority.as_deref().unwrap_or("none"));
    let repeat_rule = payload.repeat_rule.as_deref().unwrap_or("none");

    let mut props = vec![format!("name:\"{safe_title}\"")];

    if priority > 0 {
        props.push(format!("priority:{priority}"));
    }

    if let Some(notes) = payload
        .notes
        .as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    {
        props.push(format!("body:\"{}\"", escape_applescript(notes)));
    }

    if let Some(rrule) = recurrence_rrule(repeat_rule) {
        props.push(format!("recurrence:\"{}\"", escape_applescript(rrule)));
    }

    let due_literal = if let Some(due_local) = parse_due_local(&payload.due_at)? {
        Some((
            build_due_date_literal(due_local),
            "due date:dueDate".to_string(),
        ))
    } else {
        None
    };

    if let Some((_, due_prop)) = &due_literal {
        props.push(due_prop.clone());
    }

    let props_text = props.join(", ");
    let due_prefix = due_literal
        .map(|(literal, _)| format!("{literal}\n"))
        .unwrap_or_default();

    let script = format!(
        r#"{due_prefix}tell application "Reminders"
  set targetList to missing value
  repeat with l in lists
    if name of l is "{safe_list}" then
      set targetList to l
      exit repeat
    end if
  end repeat
  if targetList is missing value then
    set targetList to make new list with properties {{name:"{safe_list}"}}
  end if
  tell targetList
    make new reminder with properties {{{props_text}}}
  end tell
end tell"#
    );

    run_osascript(&script).map(|_| ())
}

fn parse_reminder_info_line(line: &str) -> Option<ReminderInfo> {
    let mut parts = line.split('\u{1f}');
    let title = parts.next()?.trim().to_string();
    if title.is_empty() {
        return None;
    }
    let notes = parts.next().unwrap_or_default().trim().to_string();
    let due_at_local = parts
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    Some(ReminderInfo {
        title,
        notes,
        due_at_local,
    })
}

fn list_apple_reminders(list_name: &str, title_prefix: &str) -> Result<Vec<ReminderInfo>, String> {
    let safe_list = escape_applescript(list_name.trim());
    let safe_prefix = escape_applescript(title_prefix.trim());

    let script = format!(
        r#"tell application "Reminders"
  set outputRows to {{}}
  set itemDelimiter to ASCII character 31
  set rowDelimiter to ASCII character 30
  tell list "{safe_list}"
    repeat with r in reminders
      set reminderName to name of r
      if reminderName starts with "{safe_prefix}" then
        set reminderBody to ""
        if body of r is not missing value then set reminderBody to body of r
        set dueText to ""
        if due date of r is not missing value then
          set d to due date of r
          set dueText to ((year of d as integer) as text) & "-" & text -2 thru -1 of ("0" & ((month of d as integer) as text)) & "-" & text -2 thru -1 of ("0" & ((day of d as integer) as text)) & "T" & text -2 thru -1 of ("0" & ((hours of d as integer) as text)) & ":" & text -2 thru -1 of ("0" & ((minutes of d as integer) as text))
        end if
        set end of outputRows to reminderName & itemDelimiter & reminderBody & itemDelimiter & dueText
      end if
    end repeat
  end tell
  set AppleScript's text item delimiters to rowDelimiter
  return outputRows as text
end tell"#
    );

    let output = run_osascript(&script)?;
    Ok(output
        .split('\u{1e}')
        .filter_map(parse_reminder_info_line)
        .collect())
}

fn delete_apple_reminder(title: &str, list_name: &str) -> Result<(), String> {
    let safe_title = escape_applescript(title.trim());
    let safe_list = escape_applescript(list_name.trim());

    let script = format!(
        r#"tell application "Reminders"
  tell list "{safe_list}"
    set matches to (every reminder whose name is "{safe_title}")
    if (count of matches) is 0 then error "Reminder not found."
    repeat with r in matches
      delete r
    end repeat
  end tell
end tell"#
    );

    run_osascript(&script).map(|_| ())
}

fn update_apple_reminder(payload: &UpdateReminderPayload) -> Result<(), String> {
    let title = payload.title.trim();
    let new_title = payload.new_title.trim();
    if title.is_empty() || new_title.is_empty() {
        return Err("Reminder title is required.".into());
    }

    let list_name = payload
        .list_name
        .as_deref()
        .unwrap_or(DEFAULT_REMINDER_LIST)
        .trim();
    if list_name.is_empty() {
        return Err("Reminder list is required.".into());
    }

    let safe_title = escape_applescript(title);
    let safe_new_title = escape_applescript(new_title);
    let safe_list = escape_applescript(list_name);
    let safe_notes = escape_applescript(payload.notes.as_deref().unwrap_or("").trim());
    let recurrence_assignment =
        if let Some(rrule) = payload.repeat_rule.as_deref().and_then(recurrence_rrule) {
            format!("set recurrence of r to \"{}\"", escape_applescript(rrule))
        } else if payload.repeat_rule.is_some() {
            "set recurrence of r to missing value".to_string()
        } else {
            String::new()
        };

    let due_local = parse_due_local(&payload.due_at)?;
    let due_prefix = due_local
        .map(build_due_date_literal)
        .map(|literal| format!("{literal}\n"))
        .unwrap_or_default();
    let due_assignment = if payload
        .due_at
        .as_ref()
        .filter(|value| !value.trim().is_empty())
        .is_some()
    {
        "set due date of r to dueDate"
    } else {
        "set due date of r to missing value"
    };

    let script = format!(
        r#"{due_prefix}tell application "Reminders"
  tell list "{safe_list}"
    set matches to (every reminder whose name is "{safe_title}")
    if (count of matches) is 0 then error "Reminder not found."
    repeat with r in matches
      set name of r to "{safe_new_title}"
      set body of r to "{safe_notes}"
      {due_assignment}
      {recurrence_assignment}
    end repeat
  end tell
end tell"#
    );

    run_osascript(&script).map(|_| ())
}

#[tauri::command]
pub fn create_reminder(payload: CreateReminderPayload) -> Result<CreateReminderResponse, String> {
    create_apple_reminder(&payload)?;

    let due_at = payload
        .due_at
        .as_ref()
        .filter(|v| !v.trim().is_empty())
        .map(|value| {
            DateTime::parse_from_rfc3339(value)
                .map(|instant| instant.with_timezone(&Utc))
                .map_err(|_| "Invalid due date or time.".to_string())
        })
        .transpose()?;

    let history = reminder_history::record_created(
        payload.title.trim().to_string(),
        payload
            .notes
            .as_ref()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty()),
        due_at,
        payload
            .list_name
            .clone()
            .unwrap_or_else(|| DEFAULT_REMINDER_LIST.into())
            .trim()
            .to_string(),
        payload.priority.clone().unwrap_or_else(|| "none".into()),
        payload.repeat_rule.clone().unwrap_or_else(|| "none".into()),
    )?;

    Ok(CreateReminderResponse {
        id: history.id,
        message: format!(
            "Created in Apple Reminders ({})",
            payload
                .list_name
                .as_deref()
                .unwrap_or(DEFAULT_REMINDER_LIST)
                .trim()
        ),
    })
}

#[tauri::command]
pub fn get_reminder_history() -> Result<Vec<ReminderHistoryEntry>, String> {
    reminder_history::load_history()
}

#[tauri::command]
pub fn list_reminders(payload: ListRemindersPayload) -> Result<Vec<ReminderInfo>, String> {
    let list_name = payload.list_name.trim();
    if list_name.is_empty() {
        return Err("Reminder list is required.".into());
    }

    list_apple_reminders(list_name, payload.title_prefix.as_deref().unwrap_or(""))
}

#[tauri::command]
pub fn update_reminder(payload: UpdateReminderPayload) -> Result<UpdateReminderResponse, String> {
    update_apple_reminder(&payload)?;

    Ok(UpdateReminderResponse {
        message: format!("Updated reminder: {}", payload.new_title.trim()),
    })
}

#[tauri::command]
pub fn delete_reminder(payload: DeleteReminderPayload) -> Result<DeleteReminderResponse, String> {
    let title = payload.title.trim();
    if title.is_empty() {
        return Err("Reminder title is required.".into());
    }

    let history_entry = reminder_history::remove_by_title(title)?;
    let list_name = payload
        .list_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| history_entry.as_ref().map(|entry| entry.list_name.clone()))
        .unwrap_or_else(|| DEFAULT_REMINDER_LIST.into());

    match delete_apple_reminder(title, &list_name) {
        Ok(()) => Ok(DeleteReminderResponse {
            message: format!("Deleted reminder: {title}"),
        }),
        Err(error) if history_entry.is_some() => Ok(DeleteReminderResponse {
            message: format!(
                "Removed from local history, but Apple Reminders delete failed: {error}"
            ),
        }),
        Err(error) => Err(error),
    }
}
