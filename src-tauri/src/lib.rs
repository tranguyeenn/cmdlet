//! Tauri backend for cmdlet: global hotkey, overlay window, and system commands.

mod academic;
mod apple_notes;
mod books;
mod calendar;
mod event_history;
mod files;
mod keyboard_lock;
mod note_history;
mod notifications;
mod planner;
mod planner_data;
mod reminder_history;
mod reminders;
mod second_brain;
mod settings;
mod spotify;
mod storage;
mod tasks;

use std::io::Write;
use std::process::{Command as ProcessCommand, Stdio};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};

use crate::planner_data::NoteEntry;

/// Launch a macOS application using the system `open` command.
#[tauri::command]
fn open_app(app_name: String) -> Result<String, String> {
    let trimmed = app_name.trim();
    if trimmed.is_empty() {
        return Err("Application name is required".into());
    }

    let status = ProcessCommand::new("open")
        .arg("-a")
        .arg(trimmed)
        .status()
        .map_err(|error| format!("Failed to run open: {error}"))?;

    if status.success() {
        Ok(format!("Launching {trimmed}..."))
    } else {
        Err(format!("Could not open application: {trimmed}"))
    }
}

/// Append a note to planner.json in iCloud storage.
#[tauri::command]
fn save_note(_app: AppHandle, text: String) -> Result<String, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Note text is required".into());
    }

    let mut planner = crate::planner_data::load_planner()?;
    planner.notes.push(NoteEntry {
        text: trimmed.to_string(),
        created_at: chrono::Utc::now(),
    });
    crate::planner_data::save_planner(&planner)?;

    Ok(format!("Saved note: {trimmed}"))
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
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Read text from the macOS clipboard.
#[tauri::command]
fn read_clipboard() -> Result<String, String> {
    let output = ProcessCommand::new("pbpaste")
        .output()
        .map_err(|error| format!("Failed to read clipboard: {error}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err("Could not read clipboard".into())
    }
}

/// Write text to the macOS clipboard.
#[tauri::command]
fn write_clipboard(text: String) -> Result<String, String> {
    let mut child = ProcessCommand::new("pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to open pbcopy: {error}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(text.as_bytes())
            .map_err(|error| format!("Failed to write clipboard: {error}"))?;
    }

    let status = child
        .wait()
        .map_err(|error| format!("Failed to finish clipboard write: {error}"))?;

    if status.success() {
        Ok("Copied to clipboard".into())
    } else {
        Err("Could not write to clipboard".into())
    }
}

/// Open a web search in the configured browser (default: Firefox).
#[tauri::command]
fn web_search(app: AppHandle, query: String) -> Result<String, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Search query is required".into());
    }

    let encoded: String = trimmed
        .chars()
        .map(|character| match character {
            ' ' => "+".to_string(),
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' => character.to_string(),
            _ => format!("%{:02X}", character as u8),
        })
        .collect();

    let url = format!("https://www.google.com/search?q={encoded}");
    let browser = settings::load_settings_from_disk(&app)?.browser;
    let status = ProcessCommand::new("open")
        .arg("-a")
        .arg(&browser)
        .arg(&url)
        .status()
        .map_err(|error| format!("Failed to open browser: {error}"))?;

    if status.success() {
        Ok(format!("Searching for: {trimmed} ({browser})"))
    } else {
        Err(format!("Could not open {browser}"))
    }
}

/// Parse durations like 30s, 5m, or 1h into seconds.
fn parse_duration(input: &str) -> Result<u64, String> {
    let trimmed = input.trim().to_lowercase();
    if trimmed.is_empty() {
        return Err("Duration is required".into());
    }

    let (number, unit) = trimmed
        .char_indices()
        .find(|(_, character)| !character.is_ascii_digit())
        .map(|(index, _)| trimmed.split_at(index))
        .unwrap_or((&trimmed, "s"));

    let value: u64 = number
        .parse()
        .map_err(|_| format!("Invalid duration: {input}"))?;

    let seconds = match unit {
        "s" | "sec" | "secs" | "second" | "seconds" => value,
        "m" | "min" | "mins" | "minute" | "minutes" => value * 60,
        "h" | "hr" | "hrs" | "hour" | "hours" => value * 3600,
        _ => return Err(format!("Unknown unit in duration: {input}")),
    };

    Ok(seconds)
}

/// Start a background timer and show a macOS notification when it finishes.
#[tauri::command]
fn start_timer(duration: String) -> Result<String, String> {
    let seconds = parse_duration(&duration)?;
    if seconds == 0 {
        return Err("Duration must be greater than zero".into());
    }

    let label = duration.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(seconds));
        let script =
            format!("display notification \"Timer finished ({label})\" with title \"cmdlet\"");
        let _ = run_osascript(&script);
    });

    Ok(format!("Timer started for {duration}"))
}

/// Control Spotify via AppleScript.
#[tauri::command]
fn spotify_control(action: String) -> Result<String, String> {
    let action = action.trim().to_lowercase();
    let script = match action.as_str() {
        "now" => {
            r#"tell application "Spotify"
                if it is not running then return "Spotify is not running"
                set trackName to name of current track
                set artistName to artist of current track
                set playerState to player state as string
                return artistName & " — " & trackName & " (" & playerState & ")"
            end tell"#
        }
        "pause" => r#"tell application "Spotify" to pause"#,
        "play" => r#"tell application "Spotify" to play"#,
        "next" => r#"tell application "Spotify" to next track"#,
        "prev" | "previous" => r#"tell application "Spotify" to previous track"#,
        _ => {
            return Err(format!(
                "Unknown Spotify action: {action}. Use: now, pause, play, next, prev"
            ))
        }
    };

    let result = run_osascript(script)?;
    if action == "now" {
        Ok(result)
    } else if result.is_empty() {
        Ok(format!("Spotify: {action}"))
    } else {
        Ok(result)
    }
}

/// Quit the application.
///
/// We force-exit the process instead of calling `app.exit(0)`: a graceful exit
/// asks every window to close, but the `CloseRequested` handler below always
/// calls `prevent_close()` (so closing the palette just hides it). That guard
/// would block a graceful shutdown indefinitely, so we terminate the process
/// directly. The short delay lets the invoke response flush first.
#[tauri::command]
fn quit_app() {
    thread::spawn(|| {
        thread::sleep(Duration::from_millis(50));
        std::process::exit(0);
    });
}

/// Bring the keyboard-lock popup to the front (always on top, across spaces).
fn show_lock_popup(app: &AppHandle) {
    let Some(window) = app.get_webview_window("lock") else {
        return;
    };
    let _ = window.center();
    let _ = window.set_always_on_top(true);
    let _ = window.set_visible_on_all_workspaces(true);
    let _ = window.show();
    let _ = window.set_focus();
}

fn hide_lock_popup(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("lock") {
        let _ = window.hide();
    }
}

/// Engage the system-wide keyboard lock and show the unlock popup. Triggered by
/// the Cmd+L global shortcut; also callable from the frontend.
#[tauri::command]
fn lock_keyboard(app: AppHandle) -> Result<(), String> {
    keyboard_lock::start_lock()?;
    show_lock_popup(&app);
    Ok(())
}

/// Release the keyboard lock and hide the popup. Invoked by the popup's button.
#[tauri::command]
fn unlock_keyboard(app: AppHandle) {
    keyboard_lock::stop_lock();
    hide_lock_popup(&app);
}

/// Handle a Cmd+L press: lock if possible, otherwise guide the user to grant
/// Accessibility permission (the lock cannot work without it).
fn engage_keyboard_lock(app: &AppHandle) {
    match keyboard_lock::start_lock() {
        Ok(()) => show_lock_popup(app),
        Err(message) => {
            let script = format!(
                "display notification {:?} with title \"cmdlet keyboard lock\"",
                message
            );
            let _ = run_osascript(&script);
            // Open the Accessibility pane so the fix is one toggle away.
            let _ = ProcessCommand::new("open")
                .arg(
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
                )
                .spawn();
        }
    }
}

/// Show or hide the palette window and notify the frontend when shown.
fn toggle_palette(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let is_visible = window.is_visible().unwrap_or(false);
    if is_visible {
        let _ = window.hide();
        return;
    }

    let _ = window.center();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = app.emit("palette-shown", ());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_app,
            save_note,
            read_clipboard,
            write_clipboard,
            web_search,
            start_timer,
            notifications::notify,
            spotify_control,
            spotify::spotify_search,
            spotify::spotify_play_track,
            storage::ensure_storage_ready_command,
            storage::read_json_command,
            storage::write_json_command,
            calendar::get_calendars,
            calendar::create_event,
            calendar::delete_event,
            calendar::create_cmdlet_calendar,
            calendar::check_cmdlet_calendar_exists,
            calendar::get_event_history,
            reminders::get_reminder_lists,
            reminders::list_reminders,
            reminders::create_reminder,
            reminders::update_reminder,
            reminders::delete_reminder,
            reminders::get_reminder_history,
            apple_notes::create_note,
            apple_notes::get_note_history,
            settings::load_settings,
            settings::update_setting,
            settings::save_settings,
            second_brain::second_brain_workbook_path,
            second_brain::second_brain_exists,
            second_brain::read_second_brain_bytes,
            second_brain::write_second_brain_bytes,
            second_brain::read_second_brain_base64,
            second_brain::write_second_brain_base64,
            second_brain::replace_second_brain_sheet_rows,
            second_brain::seed_second_brain_from_template,
            second_brain::open_second_brain_workbook,
            tasks::create_task,
            tasks::load_tasks_command,
            files::search_files,
            files::open_file,
            quit_app,
            lock_keyboard,
            unlock_keyboard,
            books::add_book,
            books::list_books,
            books::delete_book,
            books::sync_book_from_excel,
            books::set_current_book,
            books::update_book_progress,
            academic::add_class,
            academic::list_classes,
            academic::delete_class,
            academic::rename_class,
            academic::add_assignment,
            academic::list_assignments,
            academic::delete_assignment,
            academic::rename_assignment,
            academic::add_exam,
            academic::list_exams,
            academic::delete_exam,
            academic::rename_exam,
            planner::planner_dashboard,
            planner::planner_export,
        ])
        .setup(|app| {
            if let Err(error) = storage::ensure_storage_ready() {
                eprintln!("Cmdlet storage init failed: {error}");
            } else if let Err(error) = storage::migrate_from_legacy(app.handle()) {
                eprintln!("Cmdlet storage migration failed: {error}");
            }

            let app_handle = app.handle().clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(800));
                match calendar::check_cmdlet_calendar_exists() {
                    Ok(false) => {
                        let _ = app_handle.emit("cmdlet-calendar-missing", ());
                    }
                    Err(error) => {
                        eprintln!("Cmdlet calendar check failed: {error}");
                    }
                    _ => {}
                }
            });

            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                let _ = app.set_dock_visibility(false);
            }

            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                let palette_shortcut =
                    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
                let lock_shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::KeyL);
                let app_handle = app.handle().clone();

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |_app, pressed_shortcut, event| {
                            if event.state != ShortcutState::Pressed {
                                return;
                            }

                            if pressed_shortcut
                                .matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::Space)
                            {
                                toggle_palette(&app_handle);
                            } else if pressed_shortcut.matches(Modifiers::CONTROL, Code::KeyL) {
                                engage_keyboard_lock(&app_handle);
                            }
                        })
                        .build(),
                )?;

                app.global_shortcut().register(palette_shortcut)?;
                app.global_shortcut().register(lock_shortcut)?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                #[cfg(desktop)]
                {
                    use tauri_plugin_global_shortcut::GlobalShortcutExt;
                    let _ = app_handle.global_shortcut().unregister_all();
                }
            }
        });
}
