//! Second brain Excel workbook stored in the iCloud Cmdlet folder.

use std::fs;
use std::io::{Cursor, ErrorKind, Read, Write};
use std::process::Command as ProcessCommand;
use std::thread;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Deserialize;
use tauri::{AppHandle, Manager};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::storage;

const WORKBOOK_NAME: &str = "cmdlet_second_brain.xlsm";
const LEGACY_WORKBOOK_NAME: &str = "cmdlet_second_brain.xlsx";
/// Bundled starter workbook copied for a fresh user before any code-generated
/// fallback. Path is relative to the Tauri resource directory.
const TEMPLATE_RESOURCE: &str = "resources/second_brain_template.xlsm";
const WRITE_RETRIES: u32 = 4;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetRowsPayload {
    sheet_name: String,
    rows: Vec<Vec<SheetCellPayload>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetCellPayload {
    value: SheetCellValue,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum SheetCellValue {
    Blank,
    Text(String),
    Number(f64),
}

pub fn workbook_path() -> Result<std::path::PathBuf, String> {
    Ok(storage::icloud_storage_dir()?.join(WORKBOOK_NAME))
}

fn legacy_workbook_path() -> Result<std::path::PathBuf, String> {
    Ok(storage::icloud_storage_dir()?.join(LEGACY_WORKBOOK_NAME))
}

fn is_file_busy(error: &std::io::Error) -> bool {
    matches!(
        error.kind(),
        ErrorKind::PermissionDenied | ErrorKind::WouldBlock | ErrorKind::AddrInUse
    ) || error
        .raw_os_error()
        .is_some_and(|code| code == 13 || code == 11)
}

fn file_busy_message(path: &std::path::Path) -> String {
    format!(
        "Could not save the workbook because it is open elsewhere (Excel/Numbers). \
         Close {} and try again.",
        path.display()
    )
}

/// Apps that keep an editable buffer of the file and will clobber our writes
/// when they next save. Read-only openers (Spotlight, Quick Look, backups) are
/// intentionally ignored so we don't block on harmless transient access.
const EDITOR_APP_MARKERS: [&str; 5] = ["excel", "numbers", "soffice", "openoffice", "libreoffice"];

/// Path of the Office "owner" lock file (e.g. ~$cmdlet_second_brain.xlsx) that
/// Excel/Numbers create alongside an open workbook.
fn lock_file_path(path: &std::path::Path) -> Option<std::path::PathBuf> {
    let name = path.file_name()?.to_string_lossy();
    Some(path.with_file_name(format!("~${name}")))
}

/// Whether a spreadsheet editor currently has `target` open. We probe with lsof
/// rather than testing for the lock file's existence so a stale lock left by an
/// Excel crash does not block writes forever — only a live process counts.
fn editor_holding(target: &std::path::Path) -> Option<String> {
    let output = ProcessCommand::new("lsof")
        .arg("-F")
        .arg("cn")
        .arg("--")
        .arg(target)
        .output()
        .ok()?;

    // lsof exits non-zero when no process has the file open.
    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if let Some(name) = line.strip_prefix('c') {
            let lower = name.to_lowercase();
            if EDITOR_APP_MARKERS
                .iter()
                .any(|marker| lower.contains(marker))
            {
                return Some(name.to_string());
            }
        }
    }
    None
}

/// If the workbook is currently open in a spreadsheet editor, returns that
/// app's name. Writing while it is open silently loses rows: the editor holds
/// its own copy and overwrites the file on its next save. Checks both the
/// workbook and its Office lock file, since Excel for Mac may hold only the
/// latter open.
fn workbook_open_in_editor(path: &std::path::Path) -> Option<String> {
    if let Some(app) = editor_holding(path) {
        return Some(app);
    }
    lock_file_path(path).and_then(|lock| editor_holding(&lock))
}

fn replace_or_insert_workbook_override(xml: &str) -> String {
    let macro_type = "application/vnd.ms-excel.sheet.macroEnabled.main+xml";
    let workbook_override =
        format!(r#"<Override PartName="/xl/workbook.xml" ContentType="{macro_type}"/>"#);

    if let Some(start) = xml.find(r#"<Override PartName="/xl/workbook.xml""#) {
        if let Some(relative_end) = xml[start..].find("/>") {
            let end = start + relative_end + 2;
            let mut next = String::with_capacity(xml.len() + workbook_override.len());
            next.push_str(&xml[..start]);
            next.push_str(&workbook_override);
            next.push_str(&xml[end..]);
            return next;
        }
    }

    xml.replacen("</Types>", &format!("{workbook_override}</Types>"), 1)
}

fn ensure_bin_default(xml: &str) -> String {
    if xml.contains(r#"<Default Extension="bin""#) {
        return xml.to_string();
    }
    let default =
        r#"<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>"#;
    if let Some(types_start) = xml.find("<Types") {
        if let Some(relative_end) = xml[types_start..].find('>') {
            let insert_at = types_start + relative_end + 1;
            let mut next = String::with_capacity(xml.len() + default.len());
            next.push_str(&xml[..insert_at]);
            next.push_str(default);
            next.push_str(&xml[insert_at..]);
            return next;
        }
    }

    xml.to_string()
}

fn remove_table_content_types(xml: &str) -> String {
    let mut next = xml.to_string();
    loop {
        let Some(start) = next.find(r#"<Override PartName="/xl/tables/"#) else {
            break;
        };
        let Some(relative_end) = next[start..].find("/>") else {
            break;
        };
        let end = start + relative_end + 2;
        next.replace_range(start..end, "");
    }
    next
}

fn remove_calc_chain_content_type(xml: &str) -> String {
    let mut next = xml.to_string();
    if let Some(start) = next.find(r#"<Override PartName="/xl/calcChain.xml""#) {
        if let Some(relative_end) = next[start..].find("/>") {
            let end = start + relative_end + 2;
            next.replace_range(start..end, "");
        }
    }
    next
}

fn col_name(mut index: usize) -> String {
    let mut name = String::new();
    while index > 0 {
        index -= 1;
        name.insert(0, (b'A' + (index % 26) as u8) as char);
        index /= 26;
    }
    name
}

fn col_index(name: &str) -> Option<usize> {
    let mut value = 0_usize;
    let mut found = false;
    for ch in name.chars() {
        if !ch.is_ascii_alphabetic() {
            break;
        }
        found = true;
        value = value * 26 + (ch.to_ascii_uppercase() as usize - 'A' as usize + 1);
    }
    found.then_some(value)
}

fn attr_value(tag: &str, attr: &str) -> Option<String> {
    let pattern = format!(r#"{attr}=""#);
    let start = tag.find(&pattern)? + pattern.len();
    let end = tag[start..].find('"')?;
    Some(tag[start..start + end].to_string())
}

fn escape_xml_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_xml_attr(value: &str) -> String {
    escape_xml_text(value).replace('"', "&quot;")
}

fn find_tag_end(xml: &str, start: usize) -> Option<usize> {
    Some(start + xml[start..].find('>')? + 1)
}

fn find_matching_end(xml: &str, start: usize, tag: &str) -> Option<usize> {
    let close = format!("</{tag}>");
    Some(start + xml[start..].find(&close)? + close.len())
}

fn sheet_name_to_rid(workbook_xml: &str, sheet_name: &str) -> Option<String> {
    let mut cursor = workbook_xml;
    while let Some(index) = cursor.find("<sheet ") {
        let after = &cursor[index..];
        let end = after.find('>')?;
        let tag = &after[..end + 1];
        if attr_value(tag, "name").as_deref() == Some(sheet_name) {
            return attr_value(tag, "r:id");
        }
        cursor = &after[end + 1..];
    }
    None
}

fn relationship_target_for_id(rels_xml: &str, id: &str) -> Option<String> {
    let id_pattern = format!(r#"Id="{id}""#);
    let mut cursor = rels_xml;
    while let Some(index) = cursor.find("<Relationship ") {
        let after = &cursor[index..];
        let end = after.find("/>")?;
        let tag = &after[..end + 2];
        if tag.contains(&id_pattern) {
            return attr_value(tag, "Target");
        }
        cursor = &after[end + 2..];
    }
    None
}

fn worksheet_path_for_sheet(
    workbook_xml: &str,
    rels_xml: &str,
    sheet_name: &str,
) -> Option<String> {
    let rid = sheet_name_to_rid(workbook_xml, sheet_name)?;
    let target = relationship_target_for_id(rels_xml, &rid)?;
    if target.starts_with("xl/") {
        Some(target)
    } else {
        Some(format!("xl/{target}"))
    }
}

fn row_number_from_tag(row_tag: &str) -> Option<usize> {
    attr_value(row_tag, "r")?.parse().ok()
}

fn template_cell_styles(sheet_data: &str) -> Vec<Option<String>> {
    let mut styles = Vec::new();
    let Some(row_start) = sheet_data.find(r#"<row r="2""#) else {
        return styles;
    };
    let Some(row_end) = find_matching_end(sheet_data, row_start, "row") else {
        return styles;
    };
    let row_xml = &sheet_data[row_start..row_end];
    let mut cursor = row_xml;
    while let Some(index) = cursor.find("<c ") {
        let after = &cursor[index..];
        let Some(end) = after.find('>') else {
            break;
        };
        let tag = &after[..end + 1];
        if let Some(reference) = attr_value(tag, "r") {
            let letters: String = reference
                .chars()
                .take_while(|ch| ch.is_ascii_alphabetic())
                .collect();
            if let Some(column) = col_index(&letters) {
                if styles.len() < column {
                    styles.resize(column, None);
                }
                styles[column - 1] = attr_value(tag, "s");
            }
        }
        cursor = &after[end + 1..];
    }
    styles
}

fn cell_xml(
    row_number: usize,
    column: usize,
    cell: &SheetCellPayload,
    style: Option<&str>,
) -> String {
    let reference = format!("{}{}", col_name(column), row_number);
    let style_attr = style
        .map(|value| format!(r#" s="{}""#, escape_xml_attr(value)))
        .unwrap_or_default();
    match &cell.value {
        SheetCellValue::Blank => String::new(),
        SheetCellValue::Text(value) if value.trim().is_empty() => String::new(),
        SheetCellValue::Text(value) => format!(
            r#"<c r="{reference}"{style_attr} t="inlineStr"><is><t>{}</t></is></c>"#,
            escape_xml_text(value)
        ),
        SheetCellValue::Number(value) => {
            format!(r#"<c r="{reference}"{style_attr}><v>{value}</v></c>"#)
        }
    }
}

fn row_xml(row_number: usize, row: &[SheetCellPayload], styles: &[Option<String>]) -> String {
    let mut cells = String::new();
    for (index, cell) in row.iter().enumerate() {
        cells.push_str(&cell_xml(
            row_number,
            index + 1,
            cell,
            styles.get(index).and_then(|value| value.as_deref()),
        ));
    }
    if cells.is_empty() {
        String::new()
    } else {
        format!(
            r#"<row r="{row_number}" spans="1:{}">{cells}</row>"#,
            row.len().max(1)
        )
    }
}

fn replace_dimension(xml: &str, max_column: usize, max_row: usize) -> String {
    let Some(start) = xml.find("<dimension ") else {
        return xml.to_string();
    };
    let Some(end) = find_tag_end(xml, start) else {
        return xml.to_string();
    };
    let dimension = format!(
        r#"<dimension ref="A1:{}{}"/>"#,
        col_name(max_column.max(1)),
        max_row.max(1)
    );
    let mut next = String::with_capacity(xml.len() + dimension.len());
    next.push_str(&xml[..start]);
    next.push_str(&dimension);
    next.push_str(&xml[end..]);
    next
}

fn replace_sheet_rows(sheet_xml: &str, rows: &[Vec<SheetCellPayload>]) -> Result<String, String> {
    let Some(sheet_data_start) = sheet_xml.find("<sheetData") else {
        return Err("Worksheet is missing sheetData.".into());
    };
    let Some(open_end) = find_tag_end(sheet_xml, sheet_data_start) else {
        return Err("Worksheet has malformed sheetData.".into());
    };
    let Some(sheet_data_end) = sheet_xml[open_end..].find("</sheetData>") else {
        return Err("Worksheet has unterminated sheetData.".into());
    };
    let close_start = open_end + sheet_data_end;
    let existing = &sheet_xml[open_end..close_start];
    let styles = template_cell_styles(existing);

    let mut kept_rows = String::new();
    let mut cursor = existing;
    while let Some(index) = cursor.find("<row ") {
        let before = &cursor[..index];
        kept_rows.push_str(before);
        let after = &cursor[index..];
        let Some(tag_end) = find_tag_end(after, 0) else {
            break;
        };
        let tag = &after[..tag_end];
        let Some(row_end) = find_matching_end(after, 0, "row") else {
            break;
        };
        if row_number_from_tag(tag).unwrap_or(usize::MAX) < 2 {
            kept_rows.push_str(&after[..row_end]);
        }
        cursor = &after[row_end..];
    }

    let mut written_rows = String::new();
    for (index, row) in rows.iter().enumerate() {
        written_rows.push_str(&row_xml(index + 2, row, &styles));
    }

    let mut next = String::with_capacity(sheet_xml.len() + written_rows.len());
    next.push_str(&sheet_xml[..open_end]);
    next.push_str(&kept_rows);
    next.push_str(&written_rows);
    next.push_str(&sheet_xml[close_start..]);

    let max_columns = rows.iter().map(Vec::len).max().unwrap_or(1);
    Ok(replace_dimension(&next, max_columns, rows.len() + 1))
}

fn replace_sheet_rows_in_package(
    bytes: &[u8],
    sheets: &[SheetRowsPayload],
) -> Result<Vec<u8>, String> {
    let mut source = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("Workbook is not a valid zip package: {error}"))?;
    let workbook_xml = String::from_utf8(read_zip_entry(&mut source, "xl/workbook.xml")?)
        .map_err(|error| format!("Workbook XML is not UTF-8: {error}"))?;
    let rels_xml = String::from_utf8(read_zip_entry(&mut source, "xl/_rels/workbook.xml.rels")?)
        .map_err(|error| format!("Workbook relationships XML is not UTF-8: {error}"))?;

    let mut replacements: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for sheet in sheets {
        let path = worksheet_path_for_sheet(&workbook_xml, &rels_xml, &sheet.sheet_name)
            .ok_or_else(|| format!("Sheet not found in template workbook: {}", sheet.sheet_name))?;
        let current = String::from_utf8(read_zip_entry(&mut source, &path)?)
            .map_err(|error| format!("{path} is not UTF-8: {error}"))?;
        replacements.insert(path, replace_sheet_rows(&current, &sheet.rows)?);
    }

    let mut source = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("Workbook is not a valid zip package: {error}"))?;
    let mut output = Cursor::new(Vec::new());
    {
        let mut writer = ZipWriter::new(&mut output);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for index in 0..source.len() {
            let mut file = source
                .by_index(index)
                .map_err(|error| format!("Failed to read workbook zip entry: {error}"))?;
            let name = file.name().to_string();
            if name.ends_with('/') {
                writer
                    .add_directory(name, options)
                    .map_err(|error| format!("Failed to copy workbook directory: {error}"))?;
                continue;
            }
            let mut entry = Vec::new();
            file.read_to_end(&mut entry)
                .map_err(|error| format!("Failed to read {name}: {error}"))?;
            if let Some(replacement) = replacements.get(&name) {
                entry = replacement.as_bytes().to_vec();
            }
            writer
                .start_file(name, options)
                .map_err(|error| format!("Failed to write workbook entry: {error}"))?;
            writer
                .write_all(&entry)
                .map_err(|error| format!("Failed to write workbook entry: {error}"))?;
        }
        writer
            .finish()
            .map_err(|error| format!("Failed to finish workbook: {error}"))?;
    }
    Ok(output.into_inner())
}

fn normalize_content_types(xml: &str) -> String {
    let xml = replace_or_insert_workbook_override(xml);
    let xml = ensure_bin_default(&xml);
    let xml = remove_table_content_types(&xml);
    remove_calc_chain_content_type(&xml)
}

fn next_relationship_id(xml: &str) -> String {
    let mut max_id = 0_u32;
    let mut cursor = xml;
    while let Some(index) = cursor.find(r#"Id="rId"#) {
        let after = &cursor[index + 7..];
        let digits: String = after
            .chars()
            .take_while(|value| value.is_ascii_digit())
            .collect();
        if let Ok(value) = digits.parse::<u32>() {
            max_id = max_id.max(value);
        }
        cursor = after;
    }
    format!("rId{}", max_id + 1)
}

fn remove_relationships_by_target_prefix(xml: &str, target_prefix: &str) -> String {
    let mut next = xml.to_string();
    loop {
        let Some(target_index) = next.find(&format!(r#"Target="{target_prefix}"#)) else {
            break;
        };
        let Some(start) = next[..target_index].rfind("<Relationship ") else {
            break;
        };
        let Some(relative_end) = next[target_index..].find("/>") else {
            break;
        };
        let end = target_index + relative_end + 2;
        next.replace_range(start..end, "");
    }
    next
}

fn normalize_workbook_relationships(xml: &str) -> String {
    let mut next = remove_relationships_by_target_prefix(xml, "worksheets/../tables/");
    next = remove_relationships_by_target_prefix(&next, "tables/");
    next = remove_relationships_by_target_prefix(&next, "calcChain.xml");
    if next.contains("vbaProject.bin") {
        return next;
    }

    let id = next_relationship_id(&next);
    let relationship = format!(
        r#"<Relationship Id="{id}" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/>"#
    );
    next.replacen(
        "</Relationships>",
        &format!("{relationship}</Relationships>"),
        1,
    )
}

fn remove_table_parts(xml: &str) -> String {
    let mut next = xml.to_string();
    while let Some(start) = next.find("<tableParts") {
        let Some(relative_end) = next[start..].find("</tableParts>") else {
            break;
        };
        let end = start + relative_end + "</tableParts>".len();
        next.replace_range(start..end, "");
    }
    next
}

fn remove_table_relationships(xml: &str) -> String {
    let mut next = xml.to_string();
    loop {
        let Some(type_index) = next.find("relationships/table") else {
            break;
        };
        let Some(start) = next[..type_index].rfind("<Relationship ") else {
            break;
        };
        let Some(relative_end) = next[type_index..].find("/>") else {
            break;
        };
        let end = type_index + relative_end + 2;
        next.replace_range(start..end, "");
    }
    next
}

fn read_zip_entry(archive: &mut ZipArchive<Cursor<&[u8]>>, name: &str) -> Result<Vec<u8>, String> {
    let mut file = archive
        .by_name(name)
        .map_err(|error| format!("Missing {name} in workbook template: {error}"))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|error| format!("Failed to read {name}: {error}"))?;
    Ok(bytes)
}

fn normalize_xlsm_package(bytes: &[u8], template_bytes: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let mut source = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("Workbook is not a valid zip package: {error}"))?;

    let mut template_vba = None;
    if let Some(template) = template_bytes {
        if let Ok(mut template_zip) = ZipArchive::new(Cursor::new(template)) {
            template_vba = read_zip_entry(&mut template_zip, "xl/vbaProject.bin").ok();
        }
    }

    let mut output = Cursor::new(Vec::new());
    {
        let mut writer = ZipWriter::new(&mut output);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        let mut has_vba = false;

        for index in 0..source.len() {
            let mut file = source
                .by_index(index)
                .map_err(|error| format!("Failed to read workbook zip entry: {error}"))?;
            let name = file.name().to_string();
            if name.ends_with('/') || name.starts_with("xl/tables/") || name == "xl/calcChain.xml" {
                continue;
            }

            let mut entry = Vec::new();
            file.read_to_end(&mut entry)
                .map_err(|error| format!("Failed to read {name}: {error}"))?;

            if name == "[Content_Types].xml" {
                entry = normalize_content_types(&String::from_utf8_lossy(&entry)).into_bytes();
            } else if name == "xl/_rels/workbook.xml.rels" {
                entry =
                    normalize_workbook_relationships(&String::from_utf8_lossy(&entry)).into_bytes();
            } else if name.starts_with("xl/worksheets/") && name.ends_with(".xml") {
                entry = remove_table_parts(&String::from_utf8_lossy(&entry)).into_bytes();
            } else if name.starts_with("xl/worksheets/_rels/") && name.ends_with(".rels") {
                entry = remove_table_relationships(&String::from_utf8_lossy(&entry)).into_bytes();
            } else if name == "xl/vbaProject.bin" {
                has_vba = true;
            }

            writer
                .start_file(name, options)
                .map_err(|error| format!("Failed to write normalized workbook entry: {error}"))?;
            writer
                .write_all(&entry)
                .map_err(|error| format!("Failed to write normalized workbook entry: {error}"))?;
        }

        if !has_vba {
            if let Some(vba) = template_vba {
                writer
                    .start_file("xl/vbaProject.bin", options)
                    .map_err(|error| format!("Failed to write VBA project: {error}"))?;
                writer
                    .write_all(&vba)
                    .map_err(|error| format!("Failed to write VBA project: {error}"))?;
            }
        }

        writer
            .finish()
            .map_err(|error| format!("Failed to finish normalized workbook: {error}"))?;
    }

    Ok(output.into_inner())
}

fn template_bytes(app: Option<&AppHandle>) -> Option<Vec<u8>> {
    let app = app?;
    let template = app
        .path()
        .resolve(TEMPLATE_RESOURCE, tauri::path::BaseDirectory::Resource)
        .ok()?;
    fs::read(template).ok()
}

fn normalize_for_write(bytes: &[u8], app: Option<&AppHandle>) -> Result<Vec<u8>, String> {
    normalize_xlsm_package(bytes, template_bytes(app).as_deref())
}

fn migrate_legacy_workbook_if_needed(app: Option<&AppHandle>) -> Result<(), String> {
    let path = workbook_path()?;
    if path.exists() {
        return Ok(());
    }

    let legacy = legacy_workbook_path()?;
    if !legacy.exists() {
        return Ok(());
    }

    if let Some(app_name) = workbook_open_in_editor(&legacy) {
        return Err(format!(
            "Could not migrate the workbook because the old .xlsx file is open in {app_name}. \
             Close {} and try again.",
            legacy.display()
        ));
    }

    let bytes = fs::read(&legacy)
        .map_err(|error| format!("Failed to read legacy workbook for migration: {error}"))?;
    write_bytes_atomic(&path, &bytes, app)?;
    Ok(())
}

fn write_bytes_atomic_with_mode(
    path: &std::path::Path,
    bytes: &[u8],
    app: Option<&AppHandle>,
    normalize: bool,
) -> Result<(), String> {
    if let Some(app) = workbook_open_in_editor(path) {
        return Err(format!(
            "Could not save the workbook because it is open in {app}. \
             Close {} (Cmdlet keeps the data in the planner), then run brain sync.",
            path.display()
        ));
    }

    let dir = path
        .parent()
        .ok_or_else(|| "Workbook path has no parent directory.".to_string())?;
    fs::create_dir_all(dir).map_err(|error| format!("Failed to create storage folder: {error}"))?;

    let normalized;
    let bytes = if normalize {
        normalized = normalize_for_write(bytes, app)?;
        normalized.as_slice()
    } else {
        bytes
    };
    let temp_path = dir.join(format!(".{WORKBOOK_NAME}.tmp"));

    for attempt in 1..=WRITE_RETRIES {
        {
            let mut file = fs::File::create(&temp_path)
                .map_err(|error| format!("Failed to create temporary workbook file: {error}"))?;
            file.write_all(&bytes)
                .map_err(|error| format!("Failed to write temporary workbook: {error}"))?;
            file.sync_all()
                .map_err(|error| format!("Failed to flush temporary workbook: {error}"))?;
        }

        match fs::rename(&temp_path, path) {
            Ok(()) => return Ok(()),
            Err(error) if is_file_busy(&error) && attempt < WRITE_RETRIES => {
                let _ = fs::remove_file(&temp_path);
                thread::sleep(Duration::from_millis(150 * attempt as u64));
            }
            Err(error) if is_file_busy(&error) => {
                let _ = fs::remove_file(&temp_path);
                return Err(file_busy_message(path));
            }
            Err(error) => {
                let _ = fs::remove_file(&temp_path);
                return Err(format!("Failed to replace workbook: {error}"));
            }
        }
    }

    Err(file_busy_message(path))
}

fn write_bytes_atomic(
    path: &std::path::Path,
    bytes: &[u8],
    app: Option<&AppHandle>,
) -> Result<(), String> {
    write_bytes_atomic_with_mode(path, bytes, app, true)
}

fn write_package_bytes_atomic(
    path: &std::path::Path,
    bytes: &[u8],
    app: Option<&AppHandle>,
) -> Result<(), String> {
    write_bytes_atomic_with_mode(path, bytes, app, false)
}

fn read_bytes(path: &std::path::Path, app: Option<&AppHandle>) -> Result<Vec<u8>, String> {
    migrate_legacy_workbook_if_needed(app)?;
    if !path.exists() {
        return Err("Second brain workbook does not exist. Run: brain init".into());
    }

    for attempt in 1..=WRITE_RETRIES {
        match fs::read(path) {
            Ok(bytes) => return Ok(bytes),
            Err(error) if is_file_busy(&error) && attempt < WRITE_RETRIES => {
                thread::sleep(Duration::from_millis(150 * attempt as u64));
            }
            Err(error) if is_file_busy(&error) => {
                return Err(file_busy_message(path));
            }
            Err(error) => {
                return Err(format!("Failed to read workbook: {error}"));
            }
        }
    }

    Err(file_busy_message(path))
}

/// Return the absolute path to the second brain workbook.
#[tauri::command]
pub fn second_brain_workbook_path(app: AppHandle) -> Result<String, String> {
    migrate_legacy_workbook_if_needed(Some(&app))?;
    Ok(workbook_path()?.to_string_lossy().to_string())
}

/// Check whether the workbook file exists on disk.
#[tauri::command]
pub fn second_brain_exists(app: AppHandle) -> Result<bool, String> {
    migrate_legacy_workbook_if_needed(Some(&app))?;
    Ok(workbook_path()?.exists())
}

/// Read the workbook bytes from disk.
#[tauri::command]
pub fn read_second_brain_bytes(app: AppHandle) -> Result<Vec<u8>, String> {
    read_bytes(&workbook_path()?, Some(&app))
}

/// Read the workbook as base64 (more reliable over IPC than large byte arrays).
#[tauri::command]
pub fn read_second_brain_base64(app: AppHandle) -> Result<String, String> {
    let bytes = read_bytes(&workbook_path()?, Some(&app))?;
    Ok(STANDARD.encode(bytes))
}

/// Write workbook bytes to disk, creating the Cmdlet folder if needed.
#[tauri::command]
pub fn write_second_brain_bytes(app: AppHandle, bytes: Vec<u8>) -> Result<(), String> {
    write_bytes_atomic(&workbook_path()?, &bytes, Some(&app))
}

/// Write workbook from a base64 string.
#[tauri::command]
pub fn write_second_brain_base64(app: AppHandle, data: String) -> Result<(), String> {
    let bytes = STANDARD
        .decode(data.trim())
        .map_err(|error| format!("Invalid workbook data: {error}"))?;
    write_bytes_atomic(&workbook_path()?, &bytes, Some(&app))
}

/// Replace data rows in known worksheet XML while preserving the rest of the
/// macro-enabled workbook package.
#[tauri::command]
pub fn replace_second_brain_sheet_rows(
    app: AppHandle,
    sheets: Vec<SheetRowsPayload>,
) -> Result<(), String> {
    migrate_legacy_workbook_if_needed(Some(&app))?;
    let path = workbook_path()?;
    if !path.exists() {
        return Err("Second brain workbook does not exist. Run: brain init".into());
    }
    if let Some(app_name) = workbook_open_in_editor(&path) {
        return Err(format!(
            "Could not save the workbook because it is open in {app_name}. \
             Close {} and try again.",
            path.display()
        ));
    }

    let bytes = fs::read(&path).map_err(|error| format!("Failed to read workbook: {error}"))?;
    let bytes = replace_sheet_rows_in_package(&bytes, &sheets)?;
    write_package_bytes_atomic(&path, &bytes, Some(&app))
}

/// Seed the workbook from the bundled template the first time a user opens
/// Cmdlet. Returns `true` when a fresh workbook was created from the template,
/// and `false` when one already exists or no template ships with the build
/// (the caller then falls back to generating the structure in code).
#[tauri::command]
pub fn seed_second_brain_from_template(app: AppHandle) -> Result<bool, String> {
    let path = workbook_path()?;
    migrate_legacy_workbook_if_needed(Some(&app))?;
    if path.exists() {
        return Ok(false);
    }

    let template = match app
        .path()
        .resolve(TEMPLATE_RESOURCE, tauri::path::BaseDirectory::Resource)
    {
        Ok(resolved) if resolved.exists() => resolved,
        _ => return Ok(false),
    };

    let bytes = fs::read(&template)
        .map_err(|error| format!("Failed to read second brain template: {error}"))?;
    write_package_bytes_atomic(&path, &bytes, Some(&app))?;
    Ok(true)
}

/// Open the workbook with the default macOS application (Excel, Numbers, etc.).
#[tauri::command]
pub fn open_second_brain_workbook(app: AppHandle) -> Result<String, String> {
    migrate_legacy_workbook_if_needed(Some(&app))?;
    let path = workbook_path()?;
    if !path.exists() {
        return Err("Second brain workbook does not exist. Run: brain init".into());
    }

    let status = ProcessCommand::new("open")
        .arg(&path)
        .status()
        .map_err(|error| format!("Failed to open workbook: {error}"))?;

    if status.success() {
        Ok("Opened second brain workbook. Close Excel before saving new rows from Cmdlet.".into())
    } else {
        Err("Could not open second brain workbook.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_content_types, replace_sheet_rows, SheetCellPayload, SheetCellValue};

    #[test]
    fn normalize_content_types_keeps_bin_default_inside_types_with_xml_declaration() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>"#;

        let normalized = normalize_content_types(xml);

        assert!(normalized.starts_with(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>"#
        ));
        assert!(!normalized.contains(
            r#"standalone="yes"?>
<Default Extension="bin""#
        ));
        assert!(normalized.contains(
            r#"<Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>"#
        ));
    }

    #[test]
    fn replace_sheet_rows_keeps_header_and_worksheet_tail() {
        let xml = r#"<worksheet><dimension ref="A1:C2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c></row><row r="2"><c r="A2" s="5"/></row></sheetData><mergeCells count="1"/></worksheet>"#;
        let rows = vec![vec![
            SheetCellPayload {
                value: SheetCellValue::Text("Biology".into()),
            },
            SheetCellPayload {
                value: SheetCellValue::Number(42.0),
            },
        ]];

        let next = replace_sheet_rows(xml, &rows).expect("replace rows");

        assert!(next.contains(r#"<row r="1">"#));
        assert!(next.contains(r#"<c r="A2" s="5" t="inlineStr"><is><t>Biology</t></is></c>"#));
        assert!(next.contains(r#"<c r="B2"><v>42</v></c>"#));
        assert!(next.contains(r#"<mergeCells count="1"/>"#));
        assert!(next.contains(r#"<dimension ref="A1:B2"/>"#));
    }
}
