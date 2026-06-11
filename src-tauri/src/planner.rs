//! Planner overview: dashboard and export.

use serde::Serialize;
use tauri::AppHandle;

use crate::academic::{
    load_assignments, load_classes, load_exams, AssignmentEntry, ClassEntry, ExamEntry,
};
use crate::books::{load_books, Book, BookStatus};
use crate::storage;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerExport {
    pub books: Vec<Book>,
    pub classes: Vec<ClassEntry>,
    pub assignments: Vec<AssignmentEntry>,
    pub exams: Vec<ExamEntry>,
}

fn percent(current: u32, total: u32) -> u32 {
    if total == 0 {
        return 0;
    }
    ((current as f64 / total as f64) * 100.0).round() as u32
}

/// Show reading progress and planner counts.
#[tauri::command]
pub fn planner_dashboard(app: AppHandle) -> Result<String, String> {
    let books = load_books(&app)?;
    let classes = load_classes()?;
    let assignments = load_assignments()?;
    let exams = load_exams()?;

    let mut lines = vec!["Reading".to_string(), "-------".to_string()];

    let current: Vec<_> = books
        .iter()
        .filter(|book| book.status == BookStatus::Reading)
        .collect();

    if current.is_empty() {
        lines.push("  (no current books)".into());
    } else {
        for book in current {
            lines.push(format!(
                "  {}  {}/{}  ({}%)",
                book.title,
                book.current_page,
                book.total_pages,
                percent(book.current_page, book.total_pages)
            ));
        }
    }

    lines.push("".into());
    lines.push("Academic".into());
    lines.push("--------".into());
    lines.push(format!("  Classes: {}", classes.len()));
    lines.push(format!("  Assignments: {}", assignments.len()));
    lines.push(format!("  Exams: {}", exams.len()));

    Ok(lines.join("\n"))
}

/// Export planner snapshot JSON into the iCloud Cmdlet folder.
#[tauri::command]
pub fn planner_export(app: AppHandle) -> Result<String, String> {
    let export = PlannerExport {
        books: load_books(&app)?,
        classes: load_classes()?,
        assignments: load_assignments()?,
        exams: load_exams()?,
    };

    let dir = storage::ensure_storage_ready()?;
    let contents = serde_json::to_string_pretty(&export).map_err(|error| error.to_string())?;
    storage::write_json("planner-export.json", &contents)?;

    Ok(format!(
        "Exported planner snapshot to {}",
        dir.join("planner-export.json").display()
    ))
}
