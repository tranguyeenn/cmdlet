//! File search via macOS Spotlight (mdfind).

use std::path::{Path, PathBuf};
use std::process::Command as ProcessCommand;

use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileMatch {
    pub path: String,
    pub name: String,
}

fn home_dir() -> Result<PathBuf, String> {
    std::env::var("HOME")
        .map(PathBuf::from)
        .map_err(|_| "Could not resolve home directory".into())
}

/// Search for files by name under the user's home directory (top 10).
#[tauri::command]
pub fn search_files(query: String) -> Result<Vec<FileMatch>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Search query is required".into());
    }

    let home = home_dir()?;
    let output = ProcessCommand::new("mdfind")
        .arg("-onlyin")
        .arg(&home)
        .arg(trimmed)
        .output()
        .map_err(|error| format!("File search failed: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let mut matches = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let path = line.trim();
        if path.is_empty() {
            continue;
        }

        let path_buf = Path::new(path);
        if !path_buf.is_file() {
            continue;
        }

        let name = path_buf
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(path)
            .to_string();

        matches.push(FileMatch {
            path: path.to_string(),
            name,
        });

        if matches.len() >= 10 {
            break;
        }
    }

    Ok(matches)
}

/// Open a file with its default application.
#[tauri::command]
pub fn open_file(path: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("File path is required".into());
    }

    if !Path::new(trimmed).is_file() {
        return Err(format!("File not found: {trimmed}"));
    }

    let status = ProcessCommand::new("open")
        .arg(trimmed)
        .status()
        .map_err(|error| format!("Failed to open file: {error}"))?;

    if status.success() {
        Ok(format!("Opened {trimmed}"))
    } else {
        Err(format!("Could not open file: {trimmed}"))
    }
}
