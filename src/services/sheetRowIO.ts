import type ExcelJS from "exceljs";
import { toIsoDateUTC } from "../utils/dateSerializer";
import type { SheetFormId } from "./excelRowSchemas";
import { SHEET_FORMS } from "./excelRowSchemas";
import { applyRowGroupColor } from "./excelColors";

export const NA_VALUE = "n/a";

const SHEET = {
  CLASSES: "Classes",
  ASSIGNMENTS: "Assignments",
  EXAMS: "Exams",
  PROJECTS: "Projects",
  BOOKS: "Books",
  TASKS: "Tasks",
  EVENTS: "Events",
  NOTES: "Notes",
  LIFE: "Life Tracker",
} as const;

const HEADER_COUNTS: Partial<Record<SheetFormId, number>> = {
  assignments: 8,
  exams: 7,
  projects: 7,
  tasks: 6,
};

function writeTextCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  column: number,
  raw: string | undefined,
): void {
  const trimmed = raw?.trim();
  sheet.getRow(row).getCell(column).value = trimmed ? trimmed : NA_VALUE;
}

function writeDateCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  column: number,
  raw: string | undefined,
  setDateCell: (cell: ExcelJS.Cell, date: Date) => void,
  parseDueDate: (input: string) => Date | { error: string },
): void {
  const value = raw?.trim() || NA_VALUE;
  if (value === NA_VALUE) {
    sheet.getRow(row).getCell(column).value = NA_VALUE;
    return;
  }
  const parsed = parseDueDate(value);
  if (typeof parsed === "object" && "error" in parsed) {
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
  const value = raw?.trim() || NA_VALUE;
  if (value === NA_VALUE) {
    sheet.getRow(row).getCell(column).value = NA_VALUE;
    return;
  }
  const numeric = Number(value.replace(/%/g, ""));
  sheet.getRow(row).getCell(column).value = Number.isNaN(numeric) ? value : numeric;
}

function readTextCell(sheet: ExcelJS.Worksheet, row: number, column: number): string {
  const text = sheet.getRow(row).getCell(column).text?.trim();
  return text || NA_VALUE;
}

function readDateCell(sheet: ExcelJS.Worksheet, row: number, column: number): string {
  const cell = sheet.getRow(row).getCell(column);
  const value = cell.value;
  if (value instanceof Date) {
    // Stored dates are written using UTC-midnight (Date.UTC). Read them using UTC getters
    // so the date does not shift backward in west-of-UTC timezones.
    return toIsoDateUTC(value);
  }
  return readTextCell(sheet, row, column);
}

function readNumberCell(sheet: ExcelJS.Worksheet, row: number, column: number): string {
  const value = sheet.getRow(row).getCell(column).value;
  if (value === null || value === undefined || value === "") {
    return NA_VALUE;
  }
  return String(value);
}

export function lookupColumnForForm(formId: SheetFormId): number {
  switch (formId) {
    case "assignments":
    case "exams":
      return 2;
    default:
      return 1;
  }
}

export function sheetNameForForm(formId: SheetFormId): string {
  switch (formId) {
    case "classes":
      return SHEET.CLASSES;
    case "assignments":
      return SHEET.ASSIGNMENTS;
    case "exams":
      return SHEET.EXAMS;
    case "projects":
      return SHEET.PROJECTS;
    case "books":
      return SHEET.BOOKS;
    case "tasks":
      return SHEET.TASKS;
    case "events":
      return SHEET.EVENTS;
    case "notes":
      return SHEET.NOTES;
    case "life":
      return SHEET.LIFE;
    default:
      throw new Error(`Unknown form: ${formId satisfies never}`);
  }
}

export function findEditRow(
  sheet: ExcelJS.Worksheet,
  formId: SheetFormId,
  lookupValue: string,
  findRowByColumnValue: (
    sheet: ExcelJS.Worksheet,
    column: number,
    value: string,
  ) => number | null,
): number | null {
  const column = lookupColumnForForm(formId);
  return findRowByColumnValue(sheet, column, lookupValue);
}

export function readFormRowValues(
  formId: SheetFormId,
  sheet: ExcelJS.Worksheet,
  row: number,
): Record<string, string> {
  switch (formId) {
    case "classes":
      return {
        course: readTextCell(sheet, row, 1),
        professor: readTextCell(sheet, row, 2),
        credits: readTextCell(sheet, row, 3),
        semester: readTextCell(sheet, row, 4),
        currentGrade: readTextCell(sheet, row, 5),
        targetGrade: readTextCell(sheet, row, 6),
        notes: readTextCell(sheet, row, 7),
      };
    case "assignments":
      return {
        course: readTextCell(sheet, row, 1),
        assignment: readTextCell(sheet, row, 2),
        dueDate: readDateCell(sheet, row, 3),
        priority: readTextCell(sheet, row, 4),
        status: readTextCell(sheet, row, 5),
        estimatedHours: readNumberCell(sheet, row, 6),
        actualHours: readNumberCell(sheet, row, 7),
        notes: readTextCell(sheet, row, 8),
      };
    case "exams":
      return {
        course: readTextCell(sheet, row, 1),
        examName: readTextCell(sheet, row, 2),
        examDate: readDateCell(sheet, row, 3),
        weight: readNumberCell(sheet, row, 4),
        score: readNumberCell(sheet, row, 5),
        studyStatus: readTextCell(sheet, row, 6),
        notes: readTextCell(sheet, row, 7),
      };
    case "projects":
      return {
        project: readTextCell(sheet, row, 1),
        category: readTextCell(sheet, row, 2),
        status: readTextCell(sheet, row, 3),
        milestone: readTextCell(sheet, row, 4),
        deadline: readDateCell(sheet, row, 5),
        githubLink: readTextCell(sheet, row, 6),
        notes: readTextCell(sheet, row, 7),
      };
    case "books":
      return {
        title: readTextCell(sheet, row, 1),
        author: readTextCell(sheet, row, 2),
        status: readTextCell(sheet, row, 3),
        startDate: readDateCell(sheet, row, 4),
        finishDate: readDateCell(sheet, row, 5),
        currentPage: readNumberCell(sheet, row, 6),
        totalPages: readNumberCell(sheet, row, 7),
        rating: readNumberCell(sheet, row, 8),
        notes: readTextCell(sheet, row, 9),
      };
    case "tasks":
      return {
        title: readTextCell(sheet, row, 1),
        category: readTextCell(sheet, row, 2),
        dueDate: readDateCell(sheet, row, 3),
        dueTime: readTextCell(sheet, row, 4),
        status: readTextCell(sheet, row, 5),
        notes: readTextCell(sheet, row, 6),
      };
    case "events":
      return {
        title: readTextCell(sheet, row, 1),
        date: readDateCell(sheet, row, 2),
        startTime: readTextCell(sheet, row, 3),
        endTime: readTextCell(sheet, row, 4),
        notes: readTextCell(sheet, row, 5),
      };
    case "notes":
      return {
        title: readTextCell(sheet, row, 1),
        content: readTextCell(sheet, row, 2),
        created: readDateCell(sheet, row, 3),
      };
    case "life":
      return {
        date: readDateCell(sheet, row, 1),
        sleepHours: readNumberCell(sheet, row, 2),
        mood: readTextCell(sheet, row, 3),
        energy: readTextCell(sheet, row, 4),
        studyHours: readNumberCell(sheet, row, 5),
        codingHours: readNumberCell(sheet, row, 6),
        readingPages: readNumberCell(sheet, row, 7),
        notes: readTextCell(sheet, row, 8),
      };
    default:
      throw new Error(`Unknown form: ${formId satisfies never}`);
  }
}

export function applyFormRowValues(
  formId: SheetFormId,
  sheet: ExcelJS.Worksheet,
  row: number,
  values: Record<string, string>,
  deps: {
    setDateCell: (cell: ExcelJS.Cell, date: Date) => void;
    parseDueDate: (input: string) => Date | { error: string };
  },
): void {
  const { setDateCell, parseDueDate } = deps;
  const writeDate = (
    r: number,
    col: number,
    raw: string | undefined,
  ) => writeDateCell(sheet, r, col, raw, setDateCell, parseDueDate);

  switch (formId) {
    case "classes":
      writeTextCell(sheet, row, 1, values.course);
      writeTextCell(sheet, row, 2, values.professor);
      writeTextCell(sheet, row, 3, values.credits);
      writeTextCell(sheet, row, 4, values.semester);
      writeTextCell(sheet, row, 5, values.currentGrade);
      writeTextCell(sheet, row, 6, values.targetGrade);
      writeTextCell(sheet, row, 7, values.notes);
      break;
    case "assignments":
      writeTextCell(sheet, row, 1, values.course);
      writeTextCell(sheet, row, 2, values.assignment);
      writeDate(row, 3, values.dueDate);
      writeTextCell(sheet, row, 4, values.priority);
      writeTextCell(sheet, row, 5, values.status);
      writeNumberCell(sheet, row, 6, values.estimatedHours);
      writeNumberCell(sheet, row, 7, values.actualHours);
      writeTextCell(sheet, row, 8, values.notes);
      applyRowGroupColor(sheet, row, HEADER_COUNTS.assignments ?? 8, values.course);
      break;
    case "exams":
      writeTextCell(sheet, row, 1, values.course);
      writeTextCell(sheet, row, 2, values.examName);
      writeDate(row, 3, values.examDate);
      writeNumberCell(sheet, row, 4, values.weight);
      writeNumberCell(sheet, row, 5, values.score);
      writeTextCell(sheet, row, 6, values.studyStatus);
      writeTextCell(sheet, row, 7, values.notes);
      applyRowGroupColor(sheet, row, HEADER_COUNTS.exams ?? 7, values.course);
      break;
    case "projects":
      writeTextCell(sheet, row, 1, values.project);
      writeTextCell(sheet, row, 2, values.category);
      writeTextCell(sheet, row, 3, values.status);
      writeTextCell(sheet, row, 4, values.milestone);
      writeDate(row, 5, values.deadline);
      writeTextCell(sheet, row, 6, values.githubLink);
      writeTextCell(sheet, row, 7, values.notes);
      applyRowGroupColor(sheet, row, HEADER_COUNTS.projects ?? 7, values.category);
      break;
    case "books":
      writeTextCell(sheet, row, 1, values.title);
      writeTextCell(sheet, row, 2, values.author);
      writeTextCell(sheet, row, 3, values.status);
      writeDate(row, 4, values.startDate);
      writeDate(row, 5, values.finishDate);
      writeNumberCell(sheet, row, 6, values.currentPage);
      writeNumberCell(sheet, row, 7, values.totalPages);
      writeNumberCell(sheet, row, 8, values.rating);
      writeTextCell(sheet, row, 9, values.notes);
      break;
    case "tasks":
      writeTextCell(sheet, row, 1, values.title);
      writeTextCell(sheet, row, 2, values.category);
      writeDate(row, 3, values.dueDate);
      writeTextCell(sheet, row, 4, values.dueTime);
      writeTextCell(sheet, row, 5, values.status);
      writeTextCell(sheet, row, 6, values.notes);
      applyRowGroupColor(sheet, row, HEADER_COUNTS.tasks ?? 6, values.category);
      break;
    case "events":
      writeTextCell(sheet, row, 1, values.title);
      writeDate(row, 2, values.date);
      writeTextCell(sheet, row, 3, values.startTime);
      writeTextCell(sheet, row, 4, values.endTime);
      writeTextCell(sheet, row, 5, values.notes);
      break;
    case "notes":
      writeTextCell(sheet, row, 1, values.title);
      writeTextCell(sheet, row, 2, values.content);
      writeDate(row, 3, values.created);
      break;
    case "life":
      writeDate(row, 1, values.date);
      writeNumberCell(sheet, row, 2, values.sleepHours);
      writeTextCell(sheet, row, 3, values.mood);
      writeTextCell(sheet, row, 4, values.energy);
      writeNumberCell(sheet, row, 5, values.studyHours);
      writeNumberCell(sheet, row, 6, values.codingHours);
      writeNumberCell(sheet, row, 7, values.readingPages);
      writeTextCell(sheet, row, 8, values.notes);
      break;
    default:
      throw new Error(`Unknown form: ${formId satisfies never}`);
  }
}

export function lookupFieldKey(formId: SheetFormId): string {
  return SHEET_FORMS[formId].lookupField;
}
