import { invoke } from "@tauri-apps/api/core";
import ExcelJS from "exceljs";
import { SHEET_FORMS, type SheetFormId } from "./excelRowSchemas";
import { applyRowGroupColor, applyGroupConditionalFormatting } from "./excelColors";
import {
  applyFormRowValues,
  findEditRow,
  readFormRowValues,
  sheetNameForForm,
} from "./sheetRowIO";
import { extractDate, formatClock } from "../utils/dateParser";
import {
  addListValidation,
  countDataRows,
  ensureSheet,
  getWorkbookPath,
  nextDataRow,
  openWorkbookFile,
  readWorkbook,
  replaceWorkbookSheetRows,
  safeMergeCells,
  seedSecondBrainFromTemplate,
  setDateCell,
  setHeaders,
  sheetHasColumnValue,
  workbookExists,
  writeWorkbook,
  type SheetCellPayload,
  type SheetRowsPayload,
} from "./excel";
import { toExcelSerialUTC } from "../utils/dateSerializer";

export const SHEET = {
  DASHBOARD: "Dashboard",
  CLASSES: "Classes",
  ASSIGNMENTS: "Assignments",
  ASSIGNMENTS_VIEW: "Assignments View",
  EXAMS: "Exams",
  EXAMS_VIEW: "Exams View",
  PROJECTS: "Projects",
  PROJECTS_VIEW: "Projects View",
  BOOKS: "Books",
  BOOKS_VIEW: "Books View",
  TASKS: "Tasks",
  TASKS_VIEW: "Tasks View",
  EVENTS: "Events",
  EVENTS_VIEW: "Events View",
  NOTES: "Notes",
  LIFE: "Life Tracker",
  STATS: "Stats",
} as const;

const ASSIGNMENT_STATUS = ["Not Started", "In Progress", "Done"] as const;
const TASK_STATUS = ["Not Started", "In Progress", "Done"] as const;
const PRIORITY = ["Low", "Medium", "High"] as const;
const STUDY_STATUS = ["Not Started", "Reviewing", "Ready", "Completed"] as const;
const PROJECT_STATUS = [
  "Idea",
  "Planning",
  "Building",
  "Testing",
  "Released",
  "Archived",
] as const;
const BOOK_STATUS = ["To Read", "Reading", "Finished", "DNF"] as const;
const MOOD = ["Low", "Okay", "Good", "Great"] as const;
const ENERGY = ["Low", "Medium", "High"] as const;
const NA_VALUE = "n/a";

function withNaOption<T extends string>(options: readonly T[]): string[] {
  return [...options, NA_VALUE];
}

const HEADERS = {
  classes: [
    "Course",
    "Professor",
    "Credits",
    "Semester",
    "Current Grade",
    "Target Grade",
    "Notes",
  ],
  assignments: [
    "Course",
    "Assignment",
    "Due Date",
    "Priority",
    "Status",
    "Estimated Hours",
    "Actual Hours",
    "Notes",
  ],
  exams: [
    "Course",
    "Exam Name",
    "Exam Date",
    "Weight",
    "Score",
    "Study Status",
    "Notes",
  ],
  projects: [
    "Project",
    "Category",
    "Status",
    "Milestone",
    "Deadline",
    "GitHub Link",
    "Notes",
  ],
  books: [
    "Title",
    "Author",
    "Status",
    "Start Date",
    "Finish Date",
    "Current Page",
    "Total Pages",
    "Rating",
    "Notes",
  ],
  tasks: ["Title", "Category", "Due Date", "Due Time", "Status", "Notes"],
  events: ["Title", "Date", "Start Time", "End Time", "Notes"],
  notes: ["Title", "Content", "Created"],
  life: [
    "Date",
    "Sleep Hours",
    "Mood",
    "Energy",
    "Study Hours",
    "Coding Hours",
    "Reading Pages",
    "Notes",
  ],
};

function todayDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDueDate(input: string): Date | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "Due date is required." };
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
    return { error: `Invalid date: ${trimmed}. Use YYYY-MM-DD.` };
  }

  const parsed = extractDate(trimmed);
  if (parsed) {
    return parsed.date;
  }

  return { error: `Could not parse date: ${trimmed}. Try YYYY-MM-DD or "Friday".` };
}

function isFieldError(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value;
}

function findRowByColumnValue(
  sheet: ExcelJS.Worksheet,
  column: number,
  value: string,
): number | null {
  const target = value.trim().toLowerCase();
  for (let row = 2; row <= 5000; row += 1) {
    const cellValue = sheet.getRow(row).getCell(column).text?.trim().toLowerCase() ?? "";
    if (!cellValue) {
      return null;
    }
    if (cellValue === target) {
      return row;
    }
  }
  return null;
}

function removeRowByColumnValue(
  sheet: ExcelJS.Worksheet,
  column: number,
  value: string,
): boolean {
  const row = findRowByColumnValue(sheet, column, value);
  if (!row) {
    return false;
  }
  sheet.spliceRows(row, 1);
  return true;
}

function dateOnly(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function fieldValue(raw: string | undefined): string {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : NA_VALUE;
}

function writeTextCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  column: number,
  raw: string | undefined,
): void {
  sheet.getRow(row).getCell(column).value = fieldValue(raw);
}

function writeDateCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  column: number,
  raw: string | undefined,
): void {
  const value = fieldValue(raw);
  if (value === NA_VALUE) {
    sheet.getRow(row).getCell(column).value = NA_VALUE;
    return;
  }

  const parsed = parseDueDate(value);
  if (isFieldError(parsed)) {
    sheet.getRow(row).getCell(column).value = value;
    return;
  }

  setDateCell(sheet.getRow(row).getCell(column), parsed);
}

function writeNumberCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  column: number,
  raw: string | undefined,
): void {
  const value = fieldValue(raw);
  if (value === NA_VALUE) {
    sheet.getRow(row).getCell(column).value = NA_VALUE;
    return;
  }

  const numeric = Number(value.replace(/%/g, ""));
  sheet.getRow(row).getCell(column).value = Number.isNaN(numeric) ? value : numeric;
}

function parsePipeFields(
  input: string,
  fieldNames: string[],
): Record<string, string> | { error: string } {
  const parts = input.split("|").map((part) => part.trim());
  if (parts.length < fieldNames.length) {
    return {
      error: `Missing fields. Expected: ${fieldNames.join(" | ")}`,
    };
  }

  const result: Record<string, string> = {};
  fieldNames.forEach((name, index) => {
    result[name] = parts[index] ?? "";
  });
  return result;
}

function matchOption<T extends string>(
  value: string,
  options: readonly T[],
  fieldName: string,
): T | { error: string } {
  const normalized = value.trim().toLowerCase();
  const match = options.find((option) => option.toLowerCase() === normalized);
  if (!match) {
    return {
      error: `Invalid ${fieldName}. Choose: ${options.join(", ")}`,
    };
  }
  return match;
}

function isSheetInitialized(sheet: ExcelJS.Worksheet): boolean {
  const firstCell = sheet.getRow(1).getCell(1).value;
  return firstCell !== null && firstCell !== undefined && firstCell !== "";
}

function setupDataSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  validations: Array<{ column: string; options: string[] }>,
): ExcelJS.Worksheet {
  const sheet = ensureSheet(workbook, sheetName);
  if (!isSheetInitialized(sheet)) {
    setHeaders(sheet, headers);
    for (const validation of validations) {
      addListValidation(sheet, validation.column, validation.options);
    }
  }

  return sheet;
}

function buildDashboard(sheet: ExcelJS.Worksheet): void {
  sheet.columns = [{ width: 34 }, { width: 18 }];

  const title = sheet.getCell("A1");
  title.value = "Cmdlet Second Brain Dashboard";
  title.font = { bold: true, size: 16, color: { argb: "FF1E3A5F" } };
  safeMergeCells(sheet, "A1:B1");

  const rows: Array<[string, string]> = [
    ["", ""],
    ["Active Projects", '=COUNTIFS(Projects!C:C,"<>Archived",Projects!C:C,"<>")-COUNTIF(Projects!C:C,"")'],
    [
      "Assignments Due This Week",
      '=COUNTIFS(Assignments!C:C,">="&TODAY(),Assignments!C:C,"<="&TODAY()+7,Assignments!E:E,"<>Done")',
    ],
    [
      "Upcoming Exams (30 days)",
      '=COUNTIFS(Exams!C:C,">="&TODAY(),Exams!C:C,"<="&TODAY()+30)',
    ],
    [
      "Tasks Due This Week",
      '=COUNTIFS(Tasks!C:C,">="&TODAY(),Tasks!C:C,"<="&TODAY()+7,Tasks!E:E,"<>Done")',
    ],
    [
      "Upcoming Events (7 days)",
      '=COUNTIFS(Events!B:B,">="&TODAY(),Events!B:B,"<="&TODAY()+7)',
    ],
    ["Books Currently Reading", '=COUNTIF(Books!C:C,"Reading")'],
    [
      "Pages Read This Week",
      '=SUMIFS(\'Life Tracker\'!G:G,\'Life Tracker\'!A:A,">="&TODAY()-WEEKDAY(TODAY())+1,\'Life Tracker\'!A:A,"<="&TODAY()-WEEKDAY(TODAY())+7)',
    ],
    ["Semester Progress (assignments done %)", '=IFERROR(COUNTIF(Assignments!E:E,"Done")/COUNTA(Assignments!B:B),0)'],
    ["", ""],
    ["Project Completion by Status", ""],
    ["Idea", '=COUNTIF(Projects!C:C,"Idea")'],
    ["Planning", '=COUNTIF(Projects!C:C,"Planning")'],
    ["Building", '=COUNTIF(Projects!C:C,"Building")'],
    ["Testing", '=COUNTIF(Projects!C:C,"Testing")'],
    ["Released", '=COUNTIF(Projects!C:C,"Released")'],
    ["Archived", '=COUNTIF(Projects!C:C,"Archived")'],
  ];

  rows.forEach(([label, formula], index) => {
    const rowNumber = index + 2;
    const labelCell = sheet.getCell(`A${rowNumber}`);
    labelCell.value = label;
    if (label && !label.startsWith("Project")) {
      labelCell.font = { bold: true };
    }
    if (formula) {
      const valueCell = sheet.getCell(`B${rowNumber}`);
      valueCell.value = { formula };
      if (label.includes("%")) {
        valueCell.numFmt = "0%";
      }
    }
  });
}

const SHEET_ORDER = [
  SHEET.DASHBOARD,
  SHEET.CLASSES,
  SHEET.ASSIGNMENTS_VIEW,
  SHEET.EXAMS_VIEW,
  SHEET.PROJECTS_VIEW,
  SHEET.BOOKS_VIEW,
  SHEET.TASKS_VIEW,
  SHEET.EVENTS_VIEW,
  SHEET.LIFE,
  SHEET.EVENTS,
  SHEET.TASKS,
  SHEET.BOOKS,
  SHEET.PROJECTS,
  SHEET.ASSIGNMENTS,
  SHEET.EXAMS,
] as const;

const TEMPLATE_DATA_SHEETS: Array<{ name: string; columns: number }> = [
  { name: SHEET.CLASSES, columns: HEADERS.classes.length },
  { name: SHEET.ASSIGNMENTS, columns: HEADERS.assignments.length },
  { name: SHEET.EXAMS, columns: HEADERS.exams.length },
  { name: SHEET.PROJECTS, columns: HEADERS.projects.length },
  { name: SHEET.BOOKS, columns: HEADERS.books.length },
  { name: SHEET.TASKS, columns: HEADERS.tasks.length },
  { name: SHEET.EVENTS, columns: HEADERS.events.length },
  { name: SHEET.LIFE, columns: HEADERS.life.length },
];

function sortWorkbookSheets(workbook: ExcelJS.Workbook): void {
  workbook.worksheets.sort((a, b) => {
    return (
      SHEET_ORDER.indexOf(a.name as (typeof SHEET_ORDER)[number]) -
      SHEET_ORDER.indexOf(b.name as (typeof SHEET_ORDER)[number])
    );
  });
}

function refreshGroupedSheetColors(workbook: ExcelJS.Workbook): void {
  applyGroupConditionalFormatting(workbook.getWorksheet(SHEET.ASSIGNMENTS)!, 1, HEADERS.assignments.length);
  applyGroupConditionalFormatting(workbook.getWorksheet(SHEET.EXAMS)!, 1, HEADERS.exams.length);
  applyGroupConditionalFormatting(workbook.getWorksheet(SHEET.PROJECTS)!, 2, HEADERS.projects.length);
  applyGroupConditionalFormatting(workbook.getWorksheet(SHEET.TASKS)!, 2, HEADERS.tasks.length);
}

function setViewFormula(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  cellAddress: string,
  formula: string,
): void {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    return;
  }
  sheet.getCell(cellAddress).value = { formula };
}

function refreshViewSheetFormulas(workbook: ExcelJS.Workbook): void {
  setViewFormula(
    workbook,
    SHEET.ASSIGNMENTS_VIEW,
    "B2",
    'IFERROR(_xlfn.SORTBY(_xlfn._xlws.FILTER(Assignments!A2:H1000,(Assignments!B2:B1000<>"")*(Assignments!E2:E1000<>"Done")*(Assignments!E2:E1000<>"Finished")),_xlfn._xlws.FILTER(Assignments!C2:C1000,(Assignments!B2:B1000<>"")*(Assignments!E2:E1000<>"Done")*(Assignments!E2:E1000<>"Finished")),1,_xlfn._xlws.FILTER(Assignments!F2:F1000,(Assignments!B2:B1000<>"")*(Assignments!E2:E1000<>"Done")*(Assignments!E2:E1000<>"Finished")),1),"No unfinished assignments")',
  );
  setViewFormula(
    workbook,
    SHEET.EXAMS_VIEW,
    "A2",
    'IFERROR(_xlfn.SORTBY(_xlfn._xlws.FILTER(Exams!A2:F1000,(Exams!B2:B1000<>"")*(Exams!F2:F1000<>"Done")*(Exams!F2:F1000<>"Finished")),_xlfn._xlws.FILTER(Exams!C2:C1000,(Exams!B2:B1000<>"")*(Exams!F2:F1000<>"Done")*(Exams!F2:F1000<>"Finished")),1),"No unfinished exams")',
  );
  setViewFormula(
    workbook,
    SHEET.PROJECTS_VIEW,
    "A2",
    'IFERROR(_xlfn.SORTBY(_xlfn._xlws.FILTER(Projects!A2:H1000,(Projects!A2:A1000<>"")*(Projects!C2:C1000<>"Done")*(Projects!C2:C1000<>"Finished")),_xlfn._xlws.FILTER(Projects!E2:E1000,(Projects!A2:A1000<>"")*(Projects!C2:C1000<>"Done")*(Projects!C2:C1000<>"Finished")),1),"No unfinished projects")',
  );
  setViewFormula(
    workbook,
    SHEET.TASKS_VIEW,
    "A2",
    'IFERROR(_xlfn.SORTBY(_xlfn._xlws.FILTER(Tasks!A2:H1000,(Tasks!B2:B1000<>"")*(Tasks!E2:E1000<>"Done")*(Tasks!E2:E1000<>"Finished")),_xlfn._xlws.FILTER(Tasks!C2:C1000,(Tasks!B2:B1000<>"")*(Tasks!E2:E1000<>"Done")*(Tasks!E2:E1000<>"Finished")),1),"No unfinished tasks")',
  );
}

/** Ensure data sheets exist with headers; does not rebuild dashboard/stats. */
function ensureWorkbookSheets(workbook: ExcelJS.Workbook): void {
  setupDataSheet(workbook, SHEET.CLASSES, HEADERS.classes, []);
  setupDataSheet(workbook, SHEET.ASSIGNMENTS, HEADERS.assignments, [
    { column: "D", options: withNaOption(PRIORITY) },
    { column: "E", options: withNaOption(ASSIGNMENT_STATUS) },
  ]);
  setupDataSheet(workbook, SHEET.EXAMS, HEADERS.exams, [
    { column: "F", options: withNaOption(STUDY_STATUS) },
  ]);
  setupDataSheet(workbook, SHEET.PROJECTS, HEADERS.projects, [
    { column: "C", options: withNaOption(PROJECT_STATUS) },
  ]);
  setupDataSheet(workbook, SHEET.BOOKS, HEADERS.books, [
    { column: "C", options: withNaOption(BOOK_STATUS) },
  ]);
  setupDataSheet(workbook, SHEET.TASKS, HEADERS.tasks, [
    { column: "E", options: withNaOption(TASK_STATUS) },
  ]);
  setupDataSheet(workbook, SHEET.EVENTS, HEADERS.events, []);
  setupDataSheet(workbook, SHEET.LIFE, HEADERS.life, [
    { column: "C", options: withNaOption(MOOD) },
    { column: "D", options: withNaOption(ENERGY) },
  ]);

  ensureSheet(workbook, SHEET.DASHBOARD);
  sortWorkbookSheets(workbook);
}

function configureWorkbookStructure(workbook: ExcelJS.Workbook): void {
  ensureWorkbookSheets(workbook);
  ensureSheet(workbook, SHEET.ASSIGNMENTS_VIEW);
  ensureSheet(workbook, SHEET.EXAMS_VIEW);
  ensureSheet(workbook, SHEET.PROJECTS_VIEW);
  ensureSheet(workbook, SHEET.BOOKS_VIEW);
  ensureSheet(workbook, SHEET.TASKS_VIEW);
  ensureSheet(workbook, SHEET.EVENTS_VIEW);

  const dashboard = ensureSheet(workbook, SHEET.DASHBOARD);
  buildDashboard(dashboard);

  refreshViewSheetFormulas(workbook);
  refreshGroupedSheetColors(workbook);
  sortWorkbookSheets(workbook);
}

let workbookWriteChain: Promise<void> = Promise.resolve();

type WorkbookVerify = (workbook: ExcelJS.Workbook) => boolean;

function assertTemplateForm(formId: SheetFormId): void {
  if (formId === "notes") {
    throw new Error(
      `${SHEET_FORMS[formId].label} is not part of the Excel resource template.`,
    );
  }
}

function excelDateSerial(date: Date): number {
  return toExcelSerialUTC(date);
}

function sheetCellPayload(cell: ExcelJS.Cell): SheetCellPayload {
  const value = cell.value;
  if (value === null || value === undefined || value === "") {
    return { value: { kind: "blank" } };
  }
  if (value instanceof Date) {
    return { value: { kind: "number", value: excelDateSerial(value) } };
  }
  if (typeof value === "number") {
    return { value: { kind: "number", value } };
  }
  if (typeof value === "boolean") {
    return { value: { kind: "text", value: value ? "TRUE" : "FALSE" } };
  }
  if (typeof value === "object" && "text" in value) {
    return { value: { kind: "text", value: String(value.text) } };
  }
  if (typeof value === "object" && "result" in value) {
    const result = value.result;
    if (typeof result === "number") {
      return { value: { kind: "number", value: result } };
    }
    if (result instanceof Date) {
      return { value: { kind: "number", value: excelDateSerial(result) } };
    }
    if (result !== null && result !== undefined) {
      return { value: { kind: "text", value: String(result) } };
    }
  }
  return { value: { kind: "text", value: cell.text || String(value) } };
}

function rowHasPayloadValue(row: SheetCellPayload[]): boolean {
  return row.some((cell) => cell.value.kind !== "blank");
}

function extractSheetRows(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  columns: number,
): SheetRowsPayload {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    throw new Error(`Workbook is missing template sheet: ${sheetName}`);
  }

  const rows: SheetCellPayload[][] = [];
  for (let rowNumber = 2; rowNumber <= 5000; rowNumber += 1) {
    const row: SheetCellPayload[] = [];
    for (let column = 1; column <= columns; column += 1) {
      row.push(sheetCellPayload(sheet.getRow(rowNumber).getCell(column)));
    }
    if (!rowHasPayloadValue(row)) {
      break;
    }
    rows.push(row);
  }
  return { sheetName, rows };
}

function extractTemplateSheetRows(workbook: ExcelJS.Workbook): SheetRowsPayload[] {
  return TEMPLATE_DATA_SHEETS.map(({ name, columns }) =>
    extractSheetRows(workbook, name, columns),
  );
}

async function performWorkbookWrite(
  mutate: (workbook: ExcelJS.Workbook) => void | Promise<void>,
  verify?: WorkbookVerify,
): Promise<void> {
  let exists = await workbookExists();
  // First write on a fresh install: prefer the bundled template over code
  // generation so every entry point (form add, planner sync, quick log) lands
  // on the same starter layout.
  if (!exists && (await seedSecondBrainFromTemplate())) {
    exists = true;
  }
  const workbook = exists ? await readWorkbook() : new ExcelJS.Workbook();
  if (exists) {
    ensureWorkbookSheets(workbook);
  } else {
    configureWorkbookStructure(workbook);
  }
  await mutate(workbook);
  await replaceWorkbookSheetRows(extractTemplateSheetRows(workbook));

  if (verify) {
    const checked = await readWorkbook();
    if (!verify(checked)) {
      throw new Error(
        "Excel save could not be verified. Close Excel, run brain sync, and try again.",
      );
    }
  }
}

/** Serialize read-modify-write cycles so concurrent saves cannot overwrite each other. */
async function withWorkbook(
  mutate: (workbook: ExcelJS.Workbook) => void | Promise<void>,
  verify?: WorkbookVerify,
): Promise<void> {
  const task = workbookWriteChain.then(() => performWorkbookWrite(mutate, verify));
  workbookWriteChain = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export async function ensureWorkbookReady(): Promise<void> {
  if (await workbookExists()) {
    return;
  }
  // Prefer the bundled starter workbook (preserves layout, the Assignments
  // View spill sheet, and dashboard/stats); fall back to code generation when
  // no template ships with the build (e.g. older installs).
  if (await seedSecondBrainFromTemplate()) {
    return;
  }
  await initSecondBrain();
}

export interface TaskExcelPayload {
  title: string;
  category: string;
  dueDate?: string;
  dueTime?: string;
}

export interface EventExcelPayload {
  title: string;
  startAt: string;
  endAt: string;
}

export interface NoteExcelPayload {
  title: string;
  content: string;
}

export async function logTaskToExcel(payload: TaskExcelPayload): Promise<void> {
  const dueDate = payload.dueDate
    ? parseDueDate(payload.dueDate)
    : todayDate();
  if (isFieldError(dueDate)) {
    throw new Error(dueDate.error);
  }

  await withWorkbook((workbook) => {
    const sheet = workbook.getWorksheet(SHEET.TASKS)!;
    const row = nextDataRow(sheet);
    sheet.getRow(row).getCell(1).value = payload.title;
    sheet.getRow(row).getCell(2).value = payload.category;
    setDateCell(sheet.getRow(row).getCell(3), dueDate);
    sheet.getRow(row).getCell(4).value = payload.dueTime ?? "";
    sheet.getRow(row).getCell(5).value = "Not Started";
    applyRowGroupColor(sheet, row, HEADERS.tasks.length, payload.category);
  });
}

export async function removeTaskFromExcel(title: string): Promise<void> {
  await withWorkbook((workbook) => {
    removeRowByColumnValue(workbook.getWorksheet(SHEET.TASKS)!, 1, title);
  });
}

export async function logEventToExcel(payload: EventExcelPayload): Promise<void> {
  const start = new Date(payload.startAt);
  const end = new Date(payload.endAt);

  await withWorkbook((workbook) => {
    const sheet = workbook.getWorksheet(SHEET.EVENTS)!;
    const row = nextDataRow(sheet);
    sheet.getRow(row).getCell(1).value = payload.title;
    setDateCell(sheet.getRow(row).getCell(2), dateOnly(start));
    sheet.getRow(row).getCell(3).value = formatClock(start);
    sheet.getRow(row).getCell(4).value = formatClock(end);
  });
}

export async function removeEventFromExcel(title: string): Promise<void> {
  await withWorkbook((workbook) => {
    removeRowByColumnValue(workbook.getWorksheet(SHEET.EVENTS)!, 1, title);
  });
}

export async function logNoteToExcel(payload: NoteExcelPayload): Promise<void> {
  void payload;
}

export async function logClassToExcel(name: string): Promise<void> {
  await withWorkbook((workbook) => {
    const sheet = workbook.getWorksheet(SHEET.CLASSES)!;
    const row = nextDataRow(sheet);
    sheet.getRow(row).getCell(1).value = name;
  });
}

export async function removeClassFromExcel(name: string): Promise<void> {
  await withWorkbook((workbook) => {
    removeRowByColumnValue(workbook.getWorksheet(SHEET.CLASSES)!, 1, name);
  });
}

export async function removeAssignmentFromExcel(title: string): Promise<void> {
  await withWorkbook((workbook) => {
    removeRowByColumnValue(workbook.getWorksheet(SHEET.ASSIGNMENTS)!, 2, title);
  });
}

export async function removeExamFromExcel(title: string): Promise<void> {
  await withWorkbook((workbook) => {
    removeRowByColumnValue(workbook.getWorksheet(SHEET.EXAMS)!, 2, title);
  });
}

export async function removeProjectFromExcel(name: string): Promise<void> {
  await withWorkbook((workbook) => {
    const removed = removeRowByColumnValue(
      workbook.getWorksheet(SHEET.PROJECTS)!,
      1,
      name,
    );
    if (!removed) {
      throw new Error(`Project not found: ${name}`);
    }
  });
}

export async function removeBookFromExcel(title: string): Promise<void> {
  await withWorkbook((workbook) => {
    removeRowByColumnValue(workbook.getWorksheet(SHEET.BOOKS)!, 1, title);
  });
}

export async function logSimpleAssignmentToExcel(title: string): Promise<void> {
  await withWorkbook((workbook) => {
    const sheet = workbook.getWorksheet(SHEET.ASSIGNMENTS)!;
    const row = nextDataRow(sheet);
    sheet.getRow(row).getCell(1).value = "General";
    sheet.getRow(row).getCell(2).value = title;
    setDateCell(sheet.getRow(row).getCell(3), todayDate());
    sheet.getRow(row).getCell(4).value = "Medium";
    sheet.getRow(row).getCell(5).value = "Not Started";
    applyRowGroupColor(sheet, row, HEADERS.assignments.length, "General");
  });
}

export async function logSimpleExamToExcel(title: string): Promise<void> {
  await withWorkbook((workbook) => {
    const sheet = workbook.getWorksheet(SHEET.EXAMS)!;
    const row = nextDataRow(sheet);
    sheet.getRow(row).getCell(1).value = "General";
    sheet.getRow(row).getCell(2).value = title;
    setDateCell(sheet.getRow(row).getCell(3), todayDate());
    sheet.getRow(row).getCell(4).value = 0;
    sheet.getRow(row).getCell(6).value = "Not Started";
    applyRowGroupColor(sheet, row, HEADERS.exams.length, "General");
  });
}

export async function logSimpleBookToExcel(
  title: string,
  totalPages: number,
  author = "",
): Promise<void> {
  await withWorkbook((workbook) => {
    const sheet = workbook.getWorksheet(SHEET.BOOKS)!;
    const row = nextDataRow(sheet);
    sheet.getRow(row).getCell(1).value = title;
    sheet.getRow(row).getCell(2).value = author;
    sheet.getRow(row).getCell(3).value = "To Read";
    sheet.getRow(row).getCell(6).value = 0;
    sheet.getRow(row).getCell(7).value = totalPages;
  });
}

export async function updateBookProgressInExcel(
  title: string,
  currentPage: number,
): Promise<void> {
  await withWorkbook((workbook) => {
    const sheet = workbook.getWorksheet(SHEET.BOOKS)!;
    const row = findRowByColumnValue(sheet, 1, title);
    if (!row) {
      throw new Error(`Book not found in Excel: ${title}`);
    }

    sheet.getRow(row).getCell(6).value = currentPage;
    const totalPages = Number(sheet.getRow(row).getCell(7).value ?? 0);
    if (totalPages > 0 && currentPage >= totalPages) {
      sheet.getRow(row).getCell(3).value = "Finished";
    } else if (currentPage > 0) {
      sheet.getRow(row).getCell(3).value = "Reading";
    }
  });
}

export async function initSecondBrain(): Promise<string> {
  const exists = await workbookExists();
  if (exists) {
    return "Second brain workbook already exists (template layout preserved).";
  }
  if (!exists && (await seedSecondBrainFromTemplate())) {
    return "Second brain workbook created from template.";
  }
  const workbook = new ExcelJS.Workbook();
  configureWorkbookStructure(workbook);
  await writeWorkbook(workbook);
  return "Second brain workbook created.";
}

export async function openSecondBrain(): Promise<string> {
  const exists = await workbookExists();
  if (!exists) {
    return "Workbook not found. Run: brain init";
  }
  return openWorkbookFile();
}

export async function addAssignmentRow(args: string): Promise<string> {
  const fields = parsePipeFields(args, ["course", "assignment", "dueDate", "priority"]);
  if (isFieldError(fields)) {
    return fields.error;
  }

  if (!fields.course || !fields.assignment) {
    return "Course and assignment are required.";
  }

  const dueDate = parseDueDate(fields.dueDate);
  if (isFieldError(dueDate)) {
    return dueDate.error;
  }

  const priority = matchOption(fields.priority, PRIORITY, "priority");
  if (isFieldError(priority)) {
    return priority.error;
  }

  await withWorkbook((workbook) => {
    const sheet = workbook.getWorksheet(SHEET.ASSIGNMENTS)!;
    const row = nextDataRow(sheet);
    sheet.getRow(row).getCell(1).value = fields.course;
    sheet.getRow(row).getCell(2).value = fields.assignment;
    setDateCell(sheet.getRow(row).getCell(3), dueDate);
    sheet.getRow(row).getCell(4).value = priority;
    sheet.getRow(row).getCell(5).value = "Not Started";
    applyRowGroupColor(sheet, row, HEADERS.assignments.length, fields.course);
  });

  return "Assignment added.";
}

export async function addExamRow(args: string): Promise<string> {
  const fields = parsePipeFields(args, ["course", "examName", "examDate", "weight"]);
  if (isFieldError(fields)) {
    return fields.error;
  }

  if (!fields.course || !fields.examName) {
    return "Course and exam name are required.";
  }

  const examDate = parseDueDate(fields.examDate);
  if (isFieldError(examDate)) {
    return examDate.error;
  }

  const weight = Number(fields.weight.replace(/%/g, ""));
  if (Number.isNaN(weight) || weight <= 0) {
    return "Weight must be a positive number.";
  }

  await withWorkbook((workbook) => {
    const sheet = workbook.getWorksheet(SHEET.EXAMS)!;
    const row = nextDataRow(sheet);
    sheet.getRow(row).getCell(1).value = fields.course;
    sheet.getRow(row).getCell(2).value = fields.examName;
    setDateCell(sheet.getRow(row).getCell(3), examDate);
    sheet.getRow(row).getCell(4).value = weight;
    sheet.getRow(row).getCell(6).value = "Not Started";
    applyRowGroupColor(sheet, row, HEADERS.exams.length, fields.course);
  });

  return "Exam added.";
}

export async function addProjectRow(args: string): Promise<string> {
  const fields = parsePipeFields(args, ["project", "category", "status", "deadline"]);
  if (isFieldError(fields)) {
    return fields.error;
  }

  if (!fields.project) {
    return "Project name is required.";
  }

  const status = matchOption(fields.status, PROJECT_STATUS, "status");
  if (isFieldError(status)) {
    return status.error;
  }

  const deadline = parseDueDate(fields.deadline);
  if (isFieldError(deadline)) {
    return deadline.error;
  }

  await withWorkbook((workbook) => {
    const sheet = workbook.getWorksheet(SHEET.PROJECTS)!;
    const row = nextDataRow(sheet);
    sheet.getRow(row).getCell(1).value = fields.project;
    sheet.getRow(row).getCell(2).value = fields.category;
    sheet.getRow(row).getCell(3).value = status;
    setDateCell(sheet.getRow(row).getCell(5), deadline);
    applyRowGroupColor(sheet, row, HEADERS.projects.length, fields.category);
  });

  return "Project added.";
}

export async function addBookRow(args: string): Promise<string> {
  const fields = parsePipeFields(args, ["title", "author", "totalPages"]);
  if (isFieldError(fields)) {
    return fields.error;
  }

  if (!fields.title) {
    return "Title is required.";
  }

  const totalPages = Number(fields.totalPages);
  if (Number.isNaN(totalPages) || totalPages <= 0) {
    return "Total pages must be a positive number.";
  }

  await withWorkbook((workbook) => {
    const sheet = workbook.getWorksheet(SHEET.BOOKS)!;
    const row = nextDataRow(sheet);
    sheet.getRow(row).getCell(1).value = fields.title;
    sheet.getRow(row).getCell(2).value = fields.author;
    sheet.getRow(row).getCell(3).value = "To Read";
    sheet.getRow(row).getCell(6).value = 0;
    sheet.getRow(row).getCell(7).value = totalPages;
  });

  return "Book added.";
}

export async function logLifeEntry(args: string): Promise<string> {
  const fields = parsePipeFields(args, [
    "sleepHours",
    "mood",
    "energy",
    "studyHours",
    "codingHours",
    "readingPages",
  ]);
  if (isFieldError(fields)) {
    return fields.error;
  }

  const sleepHours = Number(fields.sleepHours);
  const studyHours = Number(fields.studyHours);
  const codingHours = Number(fields.codingHours);
  const readingPages = Number(fields.readingPages);

  if ([sleepHours, studyHours, codingHours, readingPages].some((n) => Number.isNaN(n) || n < 0)) {
    return "Sleep, study, coding, and reading values must be non-negative numbers.";
  }

  const mood = matchOption(fields.mood, MOOD, "mood");
  if (isFieldError(mood)) {
    return mood.error;
  }

  const energy = matchOption(fields.energy, ENERGY, "energy");
  if (isFieldError(energy)) {
    return energy.error;
  }

  await withWorkbook((workbook) => {
    const sheet = workbook.getWorksheet(SHEET.LIFE)!;
    const row = nextDataRow(sheet);
    setDateCell(sheet.getRow(row).getCell(1), todayDate());
    sheet.getRow(row).getCell(2).value = sleepHours;
    sheet.getRow(row).getCell(3).value = mood;
    sheet.getRow(row).getCell(4).value = energy;
    sheet.getRow(row).getCell(5).value = studyHours;
    sheet.getRow(row).getCell(6).value = codingHours;
    sheet.getRow(row).getCell(7).value = readingPages;
  });

  return "Life entry logged.";
}

export async function readSheetFormRow(
  formId: SheetFormId,
  lookupValue: string,
): Promise<Record<string, string>> {
  assertTemplateForm(formId);
  await ensureWorkbookReady();
  const workbook = await readWorkbook();
  ensureWorkbookSheets(workbook);
  const sheet = workbook.getWorksheet(sheetNameForForm(formId))!;
  const row = findEditRow(sheet, formId, lookupValue, findRowByColumnValue);
  if (!row) {
    throw new Error(`Not found in Excel: ${lookupValue}`);
  }
  return readFormRowValues(formId, sheet, row);
}

export async function updateSheetFormRow(
  formId: SheetFormId,
  lookupValue: string,
  values: Record<string, string>,
): Promise<void> {
  assertTemplateForm(formId);
  const verifyKey = lookupValue;
  await withWorkbook((workbook) => {
    const sheet = workbook.getWorksheet(sheetNameForForm(formId))!;
    const row = findEditRow(sheet, formId, lookupValue, findRowByColumnValue);
    if (!row) {
      throw new Error(`Not found in Excel: ${lookupValue}`);
    }
    applyFormRowValues(formId, sheet, row, values, {
      setDateCell,
      parseDueDate,
    });
  });
  void verifyKey;
}

export async function listSheetFormRows(
  formId: SheetFormId,
): Promise<Array<{ key: string; values: Record<string, string> }>> {
  assertTemplateForm(formId);
  await ensureWorkbookReady();
  const workbook = await readWorkbook();
  ensureWorkbookSheets(workbook);
  const sheet = workbook.getWorksheet(sheetNameForForm(formId))!;
  const column = formId === "assignments" || formId === "exams" ? 2 : 1;
  const rows: Array<{ key: string; values: Record<string, string> }> = [];
  for (let row = 2; row <= 5000; row += 1) {
    const key = sheet.getRow(row).getCell(column).text?.trim() ?? "";
    if (!key) {
      break;
    }
    rows.push({ key, values: readFormRowValues(formId, sheet, row) });
  }
  return rows;
}

export async function writeSheetFormRow(
  formId: SheetFormId,
  values: Record<string, string>,
): Promise<void> {
  assertTemplateForm(formId);
  const verify = buildRowVerify(formId, values);
  await withWorkbook((workbook) => {
    switch (formId) {
      case "classes": {
        const sheet = workbook.getWorksheet(SHEET.CLASSES)!;
        const row = nextDataRow(sheet);
        writeTextCell(sheet, row, 1, values.course);
        writeTextCell(sheet, row, 2, values.professor);
        writeTextCell(sheet, row, 3, values.credits);
        writeTextCell(sheet, row, 4, values.semester);
        writeTextCell(sheet, row, 5, values.currentGrade);
        writeTextCell(sheet, row, 6, values.targetGrade);
        writeTextCell(sheet, row, 7, values.notes);
        break;
      }
      case "assignments": {
        const sheet = workbook.getWorksheet(SHEET.ASSIGNMENTS)!;
        const row = nextDataRow(sheet, HEADERS.assignments.length);
        writeTextCell(sheet, row, 1, values.course);
        writeTextCell(sheet, row, 2, values.assignment);
        writeDateCell(sheet, row, 3, values.dueDate);
        writeTextCell(sheet, row, 4, values.priority);
        writeTextCell(sheet, row, 5, values.status);
        writeNumberCell(sheet, row, 6, values.estimatedHours);
        writeNumberCell(sheet, row, 7, values.actualHours);
        writeTextCell(sheet, row, 8, values.notes);
        applyRowGroupColor(sheet, row, HEADERS.assignments.length, values.course);
        break;
      }
      case "exams": {
        const sheet = workbook.getWorksheet(SHEET.EXAMS)!;
        const row = nextDataRow(sheet, HEADERS.exams.length);
        writeTextCell(sheet, row, 1, values.course);
        writeTextCell(sheet, row, 2, values.examName);
        writeDateCell(sheet, row, 3, values.examDate);
        writeNumberCell(sheet, row, 4, values.weight);
        writeNumberCell(sheet, row, 5, values.score);
        writeTextCell(sheet, row, 6, values.studyStatus);
        writeTextCell(sheet, row, 7, values.notes);
        applyRowGroupColor(sheet, row, HEADERS.exams.length, values.course);
        break;
      }
      case "projects": {
        const sheet = workbook.getWorksheet(SHEET.PROJECTS)!;
        const row = nextDataRow(sheet);
        writeTextCell(sheet, row, 1, values.project);
        writeTextCell(sheet, row, 2, values.category);
        writeTextCell(sheet, row, 3, values.status);
        writeTextCell(sheet, row, 4, values.milestone);
        writeDateCell(sheet, row, 5, values.deadline);
        writeTextCell(sheet, row, 6, values.githubLink);
        writeTextCell(sheet, row, 7, values.notes);
        applyRowGroupColor(sheet, row, HEADERS.projects.length, values.category);
        break;
      }
      case "books": {
        const sheet = workbook.getWorksheet(SHEET.BOOKS)!;
        const row = nextDataRow(sheet);
        writeTextCell(sheet, row, 1, values.title);
        writeTextCell(sheet, row, 2, values.author);
        writeTextCell(sheet, row, 3, values.status);
        writeDateCell(sheet, row, 4, values.startDate);
        writeDateCell(sheet, row, 5, values.finishDate);
        writeNumberCell(sheet, row, 6, values.currentPage);
        writeNumberCell(sheet, row, 7, values.totalPages);
        writeNumberCell(sheet, row, 8, values.rating);
        writeTextCell(sheet, row, 9, values.notes);
        break;
      }
      case "tasks": {
        const sheet = workbook.getWorksheet(SHEET.TASKS)!;
        const row = nextDataRow(sheet);
        writeTextCell(sheet, row, 1, values.title);
        writeTextCell(sheet, row, 2, values.category);
        writeDateCell(sheet, row, 3, values.dueDate);
        writeTextCell(sheet, row, 4, values.dueTime);
        writeTextCell(sheet, row, 5, values.status);
        writeTextCell(sheet, row, 6, values.notes);
        applyRowGroupColor(sheet, row, HEADERS.tasks.length, values.category);
        break;
      }
      case "events": {
        const sheet = workbook.getWorksheet(SHEET.EVENTS)!;
        const row = nextDataRow(sheet);
        writeTextCell(sheet, row, 1, values.title);
        writeDateCell(sheet, row, 2, values.date);
        writeTextCell(sheet, row, 3, values.startTime);
        writeTextCell(sheet, row, 4, values.endTime);
        writeTextCell(sheet, row, 5, values.notes);
        break;
      }
      case "notes": {
        const sheet = workbook.getWorksheet(SHEET.NOTES)!;
        const row = nextDataRow(sheet);
        writeTextCell(sheet, row, 1, values.title);
        writeTextCell(sheet, row, 2, values.content);
        writeDateCell(sheet, row, 3, values.created);
        break;
      }
      case "life": {
        const sheet = workbook.getWorksheet(SHEET.LIFE)!;
        const row = nextDataRow(sheet);
        writeDateCell(sheet, row, 1, values.date);
        writeNumberCell(sheet, row, 2, values.sleepHours);
        writeTextCell(sheet, row, 3, values.mood);
        writeTextCell(sheet, row, 4, values.energy);
        writeNumberCell(sheet, row, 5, values.studyHours);
        writeNumberCell(sheet, row, 6, values.codingHours);
        writeNumberCell(sheet, row, 7, values.readingPages);
        writeTextCell(sheet, row, 8, values.notes);
        break;
      }
      default:
        throw new Error(`Unknown sheet form: ${formId satisfies never}`);
    }
  }, verify);
}

function buildRowVerify(
  formId: SheetFormId,
  values: Record<string, string>,
): WorkbookVerify | undefined {
  switch (formId) {
    case "classes": {
      const course = values.course?.trim();
      if (!course || course.toLowerCase() === NA_VALUE) {
        return undefined;
      }
      return (workbook) =>
        sheetHasColumnValue(workbook.getWorksheet(SHEET.CLASSES)!, 1, course);
    }
    case "assignments": {
      const title = values.assignment?.trim();
      if (!title || title.toLowerCase() === NA_VALUE) {
        return undefined;
      }
      return (workbook) =>
        sheetHasColumnValue(workbook.getWorksheet(SHEET.ASSIGNMENTS)!, 2, title);
    }
    case "exams": {
      const title = values.examName?.trim();
      if (!title || title.toLowerCase() === NA_VALUE) {
        return undefined;
      }
      return (workbook) =>
        sheetHasColumnValue(workbook.getWorksheet(SHEET.EXAMS)!, 2, title);
    }
    case "projects": {
      const title = values.project?.trim();
      if (!title || title.toLowerCase() === NA_VALUE) {
        return undefined;
      }
      return (workbook) =>
        sheetHasColumnValue(workbook.getWorksheet(SHEET.PROJECTS)!, 1, title);
    }
    case "books": {
      const title = values.title?.trim();
      if (!title || title.toLowerCase() === NA_VALUE) {
        return undefined;
      }
      return (workbook) =>
        sheetHasColumnValue(workbook.getWorksheet(SHEET.BOOKS)!, 1, title);
    }
    case "tasks": {
      const title = values.title?.trim();
      if (!title || title.toLowerCase() === NA_VALUE) {
        return undefined;
      }
      return (workbook) =>
        sheetHasColumnValue(workbook.getWorksheet(SHEET.TASKS)!, 1, title);
    }
    case "events": {
      const title = values.title?.trim();
      if (!title || title.toLowerCase() === NA_VALUE) {
        return undefined;
      }
      return (workbook) =>
        sheetHasColumnValue(workbook.getWorksheet(SHEET.EVENTS)!, 1, title);
    }
    case "notes": {
      const title = values.title?.trim();
      if (!title || title.toLowerCase() === NA_VALUE) {
        return undefined;
      }
      return (workbook) =>
        sheetHasColumnValue(workbook.getWorksheet(SHEET.NOTES)!, 1, title);
    }
    case "life":
      return undefined;
    default:
      return undefined;
  }
}

interface PlannerTitleEntry {
  title: string;
}

interface PlannerClassEntry {
  name: string;
}

const STATUS_SHEETS: Array<{
  label: string;
  sheet: string;
  column: number;
  plannerCount?: () => Promise<number>;
}> = [
  {
    label: "Classes",
    sheet: SHEET.CLASSES,
    column: 1,
    plannerCount: async () => (await invoke<PlannerClassEntry[]>("list_classes")).length,
  },
  {
    label: "Assignments",
    sheet: SHEET.ASSIGNMENTS,
    column: 2,
    plannerCount: async () =>
      (await invoke<PlannerTitleEntry[]>("list_assignments")).length,
  },
  {
    label: "Exams",
    sheet: SHEET.EXAMS,
    column: 2,
    plannerCount: async () => (await invoke<PlannerTitleEntry[]>("list_exams")).length,
  },
  { label: "Projects", sheet: SHEET.PROJECTS, column: 1 },
  { label: "Books", sheet: SHEET.BOOKS, column: 1 },
  { label: "Tasks", sheet: SHEET.TASKS, column: 1 },
  { label: "Events", sheet: SHEET.EVENTS, column: 1 },
  { label: "Life Tracker", sheet: SHEET.LIFE, column: 1 },
];

export async function getWorkbookStatus(): Promise<string> {
  const path = await getWorkbookPath();
  const exists = await workbookExists();
  if (!exists) {
    return "Workbook not found.\nRun: brain init";
  }

  const workbook = await readWorkbook();
  const lines = [`Workbook: ${path}`, ""];

  let plannerDrift = 0;
  for (const entry of STATUS_SHEETS) {
    const sheet = workbook.getWorksheet(entry.sheet);
    const excelCount = sheet ? countDataRows(sheet, entry.column) : 0;
    if (entry.plannerCount) {
      const plannerCount = await entry.plannerCount();
      lines.push(`${entry.label}: ${excelCount} in Excel, ${plannerCount} in planner`);
      if (plannerCount > excelCount) {
        plannerDrift += plannerCount - excelCount;
      }
    } else {
      lines.push(`${entry.label}: ${excelCount} rows`);
    }
  }

  lines.push("");
  if (plannerDrift > 0) {
    lines.push(`${plannerDrift} planner item(s) missing from Excel. Run: brain sync`);
  } else {
    lines.push("Excel and planner counts match for classes, assignments, and exams.");
  }
  lines.push("");
  lines.push("Tip: close Excel before adding rows from Cmdlet, then run brain open to view.");

  return lines.join("\n");
}

export async function syncPlannerToExcel(): Promise<string> {
  await ensureWorkbookReady();

  const classes = await invoke<PlannerClassEntry[]>("list_classes");
  const assignments = await invoke<PlannerTitleEntry[]>("list_assignments");
  const exams = await invoke<PlannerTitleEntry[]>("list_exams");

  const added: string[] = [];

  await withWorkbook((workbook) => {
    const classesSheet = workbook.getWorksheet(SHEET.CLASSES)!;
    for (const entry of classes) {
      if (!sheetHasColumnValue(classesSheet, 1, entry.name)) {
        const row = nextDataRow(classesSheet);
        classesSheet.getRow(row).getCell(1).value = entry.name;
        for (let column = 2; column <= HEADERS.classes.length; column += 1) {
          classesSheet.getRow(row).getCell(column).value = NA_VALUE;
        }
        added.push(`Class: ${entry.name}`);
      }
    }

    const assignmentsSheet = workbook.getWorksheet(SHEET.ASSIGNMENTS)!;
    for (const entry of assignments) {
      if (!sheetHasColumnValue(assignmentsSheet, 2, entry.title)) {
        const row = nextDataRow(assignmentsSheet);
        assignmentsSheet.getRow(row).getCell(1).value = "General";
        assignmentsSheet.getRow(row).getCell(2).value = entry.title;
        setDateCell(assignmentsSheet.getRow(row).getCell(3), todayDate());
        assignmentsSheet.getRow(row).getCell(4).value = "Medium";
        assignmentsSheet.getRow(row).getCell(5).value = "Not Started";
        for (let column = 6; column <= HEADERS.assignments.length; column += 1) {
          assignmentsSheet.getRow(row).getCell(column).value = NA_VALUE;
        }
        applyRowGroupColor(
          assignmentsSheet,
          row,
          HEADERS.assignments.length,
          "General",
        );
        added.push(`Assignment: ${entry.title}`);
      }
    }

    const examsSheet = workbook.getWorksheet(SHEET.EXAMS)!;
    for (const entry of exams) {
      if (!sheetHasColumnValue(examsSheet, 2, entry.title)) {
        const row = nextDataRow(examsSheet);
        examsSheet.getRow(row).getCell(1).value = "General";
        examsSheet.getRow(row).getCell(2).value = entry.title;
        setDateCell(examsSheet.getRow(row).getCell(3), todayDate());
        examsSheet.getRow(row).getCell(4).value = NA_VALUE;
        examsSheet.getRow(row).getCell(5).value = NA_VALUE;
        examsSheet.getRow(row).getCell(6).value = "Not Started";
        examsSheet.getRow(row).getCell(7).value = NA_VALUE;
        applyRowGroupColor(examsSheet, row, HEADERS.exams.length, "General");
        added.push(`Exam: ${entry.title}`);
      }
    }
  });

  if (added.length === 0) {
    return "Excel is already up to date with planner.";
  }

  return [`Synced ${added.length} row(s) to Excel:`, ...added.map((line) => `  ${line}`)].join(
    "\n",
  );
}

/** True when args use pipe-separated second-brain syntax. */
export function isSecondBrainPipeInput(args: string): boolean {
  return args.includes("|");
}
