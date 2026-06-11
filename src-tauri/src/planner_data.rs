//! Planner data stored in planner.json inside iCloud Cmdlet folder.

use std::path::Path;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::academic::{AssignmentEntry, ClassEntry, ExamEntry};
use crate::storage;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteEntry {
    pub text: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Quicklink {
    pub id: String,
    pub label: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct PlannerData {
    #[serde(default)]
    pub classes: Vec<ClassEntry>,
    #[serde(default)]
    pub assignments: Vec<AssignmentEntry>,
    #[serde(default)]
    pub exams: Vec<ExamEntry>,
    #[serde(default)]
    pub notes: Vec<NoteEntry>,
}

pub fn load_planner() -> Result<PlannerData, String> {
    storage::read_json_value("planner.json")
}

pub fn save_planner(data: &PlannerData) -> Result<(), String> {
    storage::write_json_value("planner.json", data)
}

pub fn load_quicklinks() -> Result<Vec<Quicklink>, String> {
    storage::read_json_value("quicklinks.json")
}

pub fn save_quicklinks(links: &[Quicklink]) -> Result<(), String> {
    storage::write_json_value("quicklinks.json", links)
}

pub fn migrate_planner_from_legacy(legacy_dir: &Path) -> Result<(), String> {
    let mut planner = load_planner()?;
    let has_data = !planner.classes.is_empty()
        || !planner.assignments.is_empty()
        || !planner.exams.is_empty()
        || !planner.notes.is_empty();

    if has_data {
        return Ok(());
    }

    planner.classes = storage::read_legacy_json(&legacy_dir.join("classes.json"))?;
    planner.assignments = storage::read_legacy_json(&legacy_dir.join("assignments.json"))?;
    planner.exams = storage::read_legacy_json(&legacy_dir.join("exams.json"))?;
    planner.notes = storage::read_legacy_json(&legacy_dir.join("notes.json"))?;

    if !planner.classes.is_empty()
        || !planner.assignments.is_empty()
        || !planner.exams.is_empty()
        || !planner.notes.is_empty()
    {
        save_planner(&planner)?;
    }

    Ok(())
}
