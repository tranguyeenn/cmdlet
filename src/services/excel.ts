import ExcelJS from "exceljs";
import { timeAsync } from "../lib/perf";
import { timedInvoke } from "../lib/timedInvoke";

export const WORKBOOK_FILENAME = "cmdlet_second_brain.xlsm";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function getWorkbookPath(): Promise<string> {
  return timedInvoke<string>("second_brain_workbook_path", undefined, "excel.path");
}

export async function workbookExists(): Promise<boolean> {
  return timedInvoke<boolean>("second_brain_exists", undefined, "excel.exists");
}

/**
 * Copy the bundled starter workbook into place for a fresh user. Resolves to
 * true when a new workbook was seeded from the template, false when one already
 * exists or no template ships with the build (caller falls back to code-gen).
 */
export async function seedSecondBrainFromTemplate(): Promise<boolean> {
  return timedInvoke<boolean>("seed_second_brain_from_template", undefined, "excel.seedTemplate");
}

export async function readWorkbook(): Promise<ExcelJS.Workbook> {
  return timeAsync("excel.readWorkbook", async () => {
    const base64 = await timedInvoke<string>("read_second_brain_base64", undefined, "excel.readBase64");
    const bytes = base64ToBytes(base64);
    const workbook = new ExcelJS.Workbook();

    try {
      await timeAsync("excel.parseWorkbook", async () => {
        await workbook.xlsx.load(bytes.buffer);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not read the Excel workbook (${message}). Close Excel, run brain init, and try again.`,
      );
    }

    return workbook;
  });
}

export async function writeWorkbook(workbook: ExcelJS.Workbook): Promise<void> {
  await timeAsync("excel.writeWorkbook", async () => {
    const buffer = await timeAsync("excel.serializeWorkbook", async () =>
      workbook.xlsx.writeBuffer(),
    );
    const base64 = bytesToBase64(new Uint8Array(buffer as ArrayBuffer));
    await timedInvoke("write_second_brain_base64", { data: base64 }, "excel.writeBase64");
  });
}

export type SheetCellPayload =
  | { value: { kind: "blank" } }
  | { value: { kind: "text"; value: string } }
  | { value: { kind: "number"; value: number } };

export interface SheetRowsPayload {
  sheetName: string;
  rows: SheetCellPayload[][];
}

export async function replaceWorkbookSheetRows(
  sheets: SheetRowsPayload[],
): Promise<void> {
  await timedInvoke("replace_second_brain_sheet_rows", { sheets }, "excel.replaceSheetRows");
}

export async function openWorkbookFile(): Promise<string> {
  return timedInvoke<string>("open_second_brain_workbook", undefined, "excel.openWorkbook");
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E3A5F" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
};

/** Apply standard header styling and freeze the first row. */
export function styleHeaderRow(sheet: ExcelJS.Worksheet, columnCount: number): void {
  const headerRow = sheet.getRow(1);
  headerRow.height = 22;

  for (let col = 1; col <= columnCount; col += 1) {
    const cell = headerRow.getCell(col);
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF0F172A" } },
    };
  }

  sheet.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
}

/** Auto-size columns based on header text length. */
export function autoWidthColumns(sheet: ExcelJS.Worksheet, columnCount: number): void {
  for (let col = 1; col <= columnCount; col += 1) {
    const header = sheet.getRow(1).getCell(col).text ?? "";
    const width = Math.min(Math.max(header.length + 4, 12), 40);
    sheet.getColumn(col).width = width;
  }
}

/** Worksheet with data validation support (ExcelJS runtime API). */
type WorksheetWithValidation = ExcelJS.Worksheet & {
  dataValidations: {
    add: (
      range: string,
      rule: {
        type: string;
        allowBlank?: boolean;
        formulae: string[];
        showErrorMessage?: boolean;
        errorTitle?: string;
        error?: string;
      },
    ) => void;
  };
};

/** Add a dropdown list validation to a column range. */
export function addListValidation(
  sheet: ExcelJS.Worksheet,
  columnLetter: string,
  options: string[],
  startRow = 2,
  endRow = 2000,
): void {
  const quoted = options.map((option) => option.replace(/"/g, '""')).join(",");
  try {
    (sheet as WorksheetWithValidation).dataValidations.add(
      `${columnLetter}${startRow}:${columnLetter}${endRow}`,
      {
        type: "list",
        allowBlank: true,
        formulae: [`"${quoted}"`],
        showErrorMessage: true,
        errorTitle: "Invalid value",
        error: `Choose one of: ${options.join(", ")}`,
      },
    );
  } catch {
    // Ignore duplicate validations when reopening an Excel-edited workbook.
  }
}

function cellHasValue(value: ExcelJS.CellValue): boolean {
  return value !== null && value !== undefined && value !== "";
}

/**
 * Find the next empty row in a sheet. A row counts as occupied when any cell
 * across columns 1..columnCount holds a value. Scanning the whole record (not
 * just column 1) matters because applyRowGroupColor nulls out blank/"n/a"
 * cells — including the optional Course column on Assignments/Exams — and a
 * single-column check would then treat a written row as empty and overwrite it.
 */
export function nextDataRow(sheet: ExcelJS.Worksheet, columnCount = 1): number {
  let row = 2;
  while (row <= 5000) {
    const sheetRow = sheet.getRow(row);
    let occupied = false;
    for (let column = 1; column <= columnCount; column += 1) {
      if (cellHasValue(sheetRow.getCell(column).value)) {
        occupied = true;
        break;
      }
    }
    if (!occupied) {
      return row;
    }
    row += 1;
  }
  return row;
}

/** Count contiguous data rows starting at row 2 for a column. */
export function countDataRows(sheet: ExcelJS.Worksheet, column = 1): number {
  let count = 0;
  for (let row = 2; row <= 5000; row += 1) {
    if (!cellHasValue(sheet.getRow(row).getCell(column).value)) {
      break;
    }
    count += 1;
  }
  return count;
}

/** Whether a row exists with an exact column match (case-insensitive). */
export function sheetHasColumnValue(
  sheet: ExcelJS.Worksheet,
  column: number,
  value: string,
): boolean {
  const target = value.trim().toLowerCase();
  for (let row = 2; row <= 5000; row += 1) {
    const cellValue = sheet.getRow(row).getCell(column).text?.trim().toLowerCase() ?? "";
    if (!cellValue) {
      return false;
    }
    if (cellValue === target) {
      return true;
    }
  }
  return false;
}

/** Write a date value with Excel date formatting. */
export function setDateCell(cell: ExcelJS.Cell, date: Date): void {
  // Anchor to UTC midnight of the intended calendar day. ExcelJS serializes
  // dates via getTime() (UTC epoch), so a local-midnight Date would bake the
  // local offset into the stored serial and shift the displayed day by one in
  // non-UTC timezones. UTC midnight yields the timezone-independent integer
  // serial; readDateCell recovers it with UTC getters.
  cell.value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  cell.numFmt = "yyyy-mm-dd";
}

export function ensureSheet(
  workbook: ExcelJS.Workbook,
  name: string,
): ExcelJS.Worksheet {
  return workbook.getWorksheet(name) ?? workbook.addWorksheet(name);
}

/** Merge a range, ignoring cells that are already merged. */
export function safeMergeCells(sheet: ExcelJS.Worksheet, range: string): void {
  try {
    sheet.mergeCells(range);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("already merged")) {
      throw error;
    }
  }
}

export function setHeaders(sheet: ExcelJS.Worksheet, headers: readonly string[]): void {
  headers.forEach((header, index) => {
    sheet.getRow(1).getCell(index + 1).value = header;
  });
  styleHeaderRow(sheet, headers.length);
  autoWidthColumns(sheet, headers.length);
}
