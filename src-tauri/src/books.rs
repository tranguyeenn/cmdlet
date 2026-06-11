//! Local book tracking in books.json (iCloud synced).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use crate::storage;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BookStatus {
    NotStarted,
    Reading,
    Finished,
}

impl BookStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::NotStarted => "not-started",
            Self::Reading => "reading",
            Self::Finished => "finished",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: String,
    pub title: String,
    pub total_pages: u32,
    pub current_page: u32,
    pub status: BookStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<DateTime<Utc>>,
}

pub fn load_books(_app: &AppHandle) -> Result<Vec<Book>, String> {
    load_books_from_storage()
}

fn load_books_from_storage() -> Result<Vec<Book>, String> {
    storage::read_json_value("books.json")
}

fn write_books(books: &[Book]) -> Result<(), String> {
    storage::write_json_value("books.json", books)
}

fn find_book_index(books: &[Book], title: &str) -> Option<usize> {
    let needle = title.trim().to_lowercase();
    books
        .iter()
        .position(|book| book.title.to_lowercase() == needle)
        .or_else(|| {
            books
                .iter()
                .position(|book| book.title.to_lowercase().contains(&needle))
        })
}

fn apply_progress(book: &mut Book, value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    let now = Utc::now();

    if let Some(delta_text) = trimmed.strip_prefix('+') {
        let delta: u32 = delta_text
            .parse()
            .map_err(|_| format!("Invalid page increment: {value}"))?;
        book.current_page = book.current_page.saturating_add(delta);
    } else {
        book.current_page = trimmed
            .parse()
            .map_err(|_| format!("Invalid page number: {value}"))?;
    }

    if book.current_page >= book.total_pages {
        book.current_page = book.total_pages;
        book.status = BookStatus::Finished;
        book.finished_at = Some(now);
    } else if book.current_page > 0 {
        book.status = BookStatus::Reading;
        book.finished_at = None;
    }

    book.updated_at = now;
    Ok(())
}

/// Add a book to the local library.
#[tauri::command]
pub fn add_book(app: AppHandle, title: String, total_pages: u32) -> Result<String, String> {
    let _ = app;
    let title = title.trim();
    if title.is_empty() {
        return Err("Book title is required".into());
    }
    if total_pages == 0 {
        return Err("Total pages must be greater than zero".into());
    }

    let mut books = load_books_from_storage()?;
    if find_book_index(&books, title).is_some() {
        return Err(format!("Book already exists: {title}"));
    }

    let now = Utc::now();
    books.push(Book {
        id: Uuid::new_v4().to_string(),
        title: title.to_string(),
        total_pages,
        current_page: 0,
        status: BookStatus::NotStarted,
        created_at: now,
        updated_at: now,
        finished_at: None,
    });
    write_books(&books)?;

    Ok(format!("Added book: {title} ({total_pages} pages)"))
}

/// List all saved books.
#[tauri::command]
pub fn list_books(app: AppHandle) -> Result<Vec<Book>, String> {
    load_books(&app)
}

/// Mark a book as the current read.
#[tauri::command]
pub fn set_current_book(app: AppHandle, title: String) -> Result<String, String> {
    let _ = app;
    let mut books = load_books_from_storage()?;
    let index = find_book_index(&books, &title)
        .ok_or_else(|| format!("Book not found: {}", title.trim()))?;

    let now = Utc::now();
    books[index].status = BookStatus::Reading;
    books[index].updated_at = now;
    if books[index].finished_at.is_some() && books[index].current_page < books[index].total_pages {
        books[index].finished_at = None;
    }

    let book_title = books[index].title.clone();
    write_books(&books)?;
    Ok(format!("Now reading: {book_title}"))
}

/// Set or increment reading progress for a book.
#[tauri::command]
pub fn update_book_progress(
    app: AppHandle,
    title: String,
    value: String,
) -> Result<String, String> {
    let _ = app;
    let mut books = load_books_from_storage()?;
    let index = find_book_index(&books, &title)
        .ok_or_else(|| format!("Book not found: {}", title.trim()))?;

    apply_progress(&mut books[index], &value)?;

    let book = books[index].clone();
    write_books(&books)?;

    let percent = if book.total_pages > 0 {
        (book.current_page as f64 / book.total_pages as f64 * 100.0).round() as u32
    } else {
        0
    };

    Ok(format!(
        "{}: {}/{} pages ({}%) — {}",
        book.title,
        book.current_page,
        book.total_pages,
        percent,
        book.status.as_str()
    ))
}

/// Remove a book from the local library.
#[tauri::command]
pub fn delete_book(app: AppHandle, title: String) -> Result<String, String> {
    let _ = app;
    let title = title.trim();
    if title.is_empty() {
        return Err("Book title is required".into());
    }

    let mut books = load_books_from_storage()?;
    let before = books.len();
    books.retain(|book| book.title.trim().to_lowercase() != title.to_lowercase());
    if books.len() == before {
        return Err(format!("Book not found: {title}"));
    }

    write_books(&books)?;
    Ok(format!("Deleted book: {title}"))
}

/// Sync local book JSON from an Excel row edit.
#[tauri::command]
pub fn sync_book_from_excel(
    app: AppHandle,
    old_title: String,
    title: String,
    total_pages: u32,
    current_page: u32,
    status: String,
) -> Result<String, String> {
    let _ = app;
    let old = old_title.trim();
    let new_title = title.trim();
    if new_title.is_empty() {
        return Err("Book title is required".into());
    }

    let mut books = load_books_from_storage()?;
    let index = find_book_index(&books, old).or_else(|| find_book_index(&books, new_title));

    let now = Utc::now();
    if let Some(index) = index {
        books[index].title = new_title.to_string();
        if total_pages > 0 {
            books[index].total_pages = total_pages;
        }
        books[index].current_page = current_page;
        books[index].updated_at = now;

        let normalized = status.trim().to_lowercase();
        if normalized.contains("read") && !normalized.contains("to") {
            books[index].status = BookStatus::Reading;
        } else if normalized.contains("finish") {
            books[index].status = BookStatus::Finished;
            books[index].finished_at = Some(now);
        } else if normalized.contains("dnf") {
            books[index].status = BookStatus::Finished;
        }

        write_books(&books)?;
        return Ok(format!("Synced book: {new_title}"));
    }

    if total_pages == 0 {
        return Err(format!("Book not found: {old}"));
    }

    books.push(Book {
        id: Uuid::new_v4().to_string(),
        title: new_title.to_string(),
        total_pages,
        current_page,
        status: BookStatus::NotStarted,
        created_at: now,
        updated_at: now,
        finished_at: None,
    });
    write_books(&books)?;
    Ok(format!("Synced book: {new_title}"))
}
