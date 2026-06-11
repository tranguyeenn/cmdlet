//! Academic planner items stored in planner.json.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use crate::planner_data;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClassEntry {
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AssignmentEntry {
    pub id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExamEntry {
    pub id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
}

fn update_planner<F>(mutator: F) -> Result<(), String>
where
    F: FnOnce(&mut planner_data::PlannerData),
{
    let mut planner = planner_data::load_planner()?;
    mutator(&mut planner);
    planner_data::save_planner(&planner)
}

#[tauri::command]
pub fn add_class(_app: AppHandle, name: String) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Class name is required".into());
    }

    update_planner(|planner| {
        planner.classes.push(ClassEntry {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            created_at: Utc::now(),
        });
    })?;

    Ok(format!("Added class: {name}"))
}

#[tauri::command]
pub fn list_classes(_app: AppHandle) -> Result<Vec<ClassEntry>, String> {
    load_classes()
}

#[tauri::command]
pub fn delete_class(_app: AppHandle, name: String) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Class name is required".into());
    }

    let mut removed = false;
    update_planner(|planner| {
        let before = planner.classes.len();
        planner
            .classes
            .retain(|entry| !names_match(&entry.name, name));
        removed = planner.classes.len() < before;
    })?;

    if removed {
        Ok(format!("Deleted class: {name}"))
    } else {
        Err(format!("Class not found: {name}"))
    }
}

fn names_match(left: &str, right: &str) -> bool {
    left.trim().eq_ignore_ascii_case(right.trim())
}

pub fn load_classes() -> Result<Vec<ClassEntry>, String> {
    Ok(planner_data::load_planner()?.classes)
}

#[tauri::command]
pub fn add_assignment(_app: AppHandle, title: String) -> Result<String, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Assignment title is required".into());
    }

    update_planner(|planner| {
        planner.assignments.push(AssignmentEntry {
            id: Uuid::new_v4().to_string(),
            title: title.to_string(),
            created_at: Utc::now(),
        });
    })?;

    Ok(format!("Added assignment: {title}"))
}

#[tauri::command]
pub fn list_assignments(_app: AppHandle) -> Result<Vec<AssignmentEntry>, String> {
    load_assignments()
}

pub fn load_assignments() -> Result<Vec<AssignmentEntry>, String> {
    Ok(planner_data::load_planner()?.assignments)
}

#[tauri::command]
pub fn delete_assignment(_app: AppHandle, title: String) -> Result<String, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Assignment title is required".into());
    }

    let mut removed = false;
    update_planner(|planner| {
        let before = planner.assignments.len();
        planner
            .assignments
            .retain(|entry| !names_match(&entry.title, title));
        removed = planner.assignments.len() < before;
    })?;

    if removed {
        Ok(format!("Deleted assignment: {title}"))
    } else {
        Err(format!("Assignment not found: {title}"))
    }
}

#[tauri::command]
pub fn add_exam(_app: AppHandle, title: String) -> Result<String, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Exam title is required".into());
    }

    update_planner(|planner| {
        planner.exams.push(ExamEntry {
            id: Uuid::new_v4().to_string(),
            title: title.to_string(),
            created_at: Utc::now(),
        });
    })?;

    Ok(format!("Added exam: {title}"))
}

#[tauri::command]
pub fn list_exams(_app: AppHandle) -> Result<Vec<ExamEntry>, String> {
    load_exams()
}

pub fn load_exams() -> Result<Vec<ExamEntry>, String> {
    Ok(planner_data::load_planner()?.exams)
}

fn rename_planner_title<F>(mutator: F, old_title: &str, new_title: &str) -> Result<bool, String>
where
    F: FnOnce(&mut planner_data::PlannerData, &str, &str) -> bool,
{
    let old = old_title.trim();
    let new = new_title.trim();
    if new.is_empty() {
        return Err("Title is required".into());
    }

    let mut renamed = false;
    update_planner(|planner| {
        renamed = mutator(planner, old, new);
    })?;
    Ok(renamed)
}

#[tauri::command]
pub fn rename_class(_app: AppHandle, old_name: String, new_name: String) -> Result<String, String> {
    let renamed = rename_planner_title(
        |planner, old, new| {
            let mut found = false;
            for entry in &mut planner.classes {
                if names_match(&entry.name, old) {
                    entry.name = new.to_string();
                    found = true;
                }
            }
            found
        },
        &old_name,
        &new_name,
    )?;

    if renamed {
        Ok(format!("Renamed class: {new_name}"))
    } else {
        Err(format!("Class not found: {}", old_name.trim()))
    }
}

#[tauri::command]
pub fn rename_assignment(
    _app: AppHandle,
    old_title: String,
    new_title: String,
) -> Result<String, String> {
    let renamed = rename_planner_title(
        |planner, old, new| {
            let mut found = false;
            for entry in &mut planner.assignments {
                if names_match(&entry.title, old) {
                    entry.title = new.to_string();
                    found = true;
                }
            }
            found
        },
        &old_title,
        &new_title,
    )?;

    if renamed {
        Ok(format!("Renamed assignment: {new_title}"))
    } else {
        Err(format!("Assignment not found: {}", old_title.trim()))
    }
}

#[tauri::command]
pub fn rename_exam(
    _app: AppHandle,
    old_title: String,
    new_title: String,
) -> Result<String, String> {
    let renamed = rename_planner_title(
        |planner, old, new| {
            let mut found = false;
            for entry in &mut planner.exams {
                if names_match(&entry.title, old) {
                    entry.title = new.to_string();
                    found = true;
                }
            }
            found
        },
        &old_title,
        &new_title,
    )?;

    if renamed {
        Ok(format!("Renamed exam: {new_title}"))
    } else {
        Err(format!("Exam not found: {}", old_title.trim()))
    }
}

#[tauri::command]
pub fn delete_exam(_app: AppHandle, title: String) -> Result<String, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Exam title is required".into());
    }

    let mut removed = false;
    update_planner(|planner| {
        let before = planner.exams.len();
        planner
            .exams
            .retain(|entry| !names_match(&entry.title, title));
        removed = planner.exams.len() < before;
    })?;

    if removed {
        Ok(format!("Deleted exam: {title}"))
    } else {
        Err(format!("Exam not found: {title}"))
    }
}
