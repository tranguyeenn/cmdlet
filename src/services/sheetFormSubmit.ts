import { invoke } from "@tauri-apps/api/core";
import type { CommandResult } from "../types";
import { createEvent } from "../storage/calendarStore";
import { createAppleNote } from "../storage/noteStore";
import { loadSettings } from "../storage/settingsStore";
import { buildEventTimes } from "../utils/hubExecute";
import type { SheetFormId } from "./excelRowSchemas";
import {
  readSheetFormRow,
  writeSheetFormRow,
  updateSheetFormRow,
} from "./secondBrain";
import { syncDueRemindersQuiet, syncTaskReminder } from "./dueReminders";

const NA = "n/a";

function excelErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (
    lower.includes("open elsewhere") ||
    lower.includes("close excel") ||
    lower.includes("open in")
  ) {
    return message;
  }
  return `Excel sync failed: ${message}. Close the workbook in Excel and try again.`;
}

async function saveRow(
  formId: SheetFormId,
  values: Record<string, string>,
  message: string,
): Promise<CommandResult> {
  try {
    await writeSheetFormRow(formId, values);
  } catch (error) {
    return excelErrorMessage(error);
  }
  return `${message} (logged to Excel)`;
}

function isNa(value: string | undefined): boolean {
  return !value?.trim() || value.trim().toLowerCase() === NA;
}

export async function submitClassRow(
  values: Record<string, string>,
): Promise<CommandResult> {
  const course = values.course?.trim();
  if (!course || course.toLowerCase() === NA) {
    return "Course is required.";
  }

  try {
    await writeSheetFormRow("classes", values);
  } catch (error) {
    return excelErrorMessage(error);
  }

  const plannerMessage = await invoke<string>("add_class", { name: course });
  return `${plannerMessage} (logged to Excel)`;
}

export async function submitAssignmentRow(
  values: Record<string, string>,
): Promise<CommandResult> {
  try {
    await writeSheetFormRow("assignments", values);
  } catch (error) {
    return excelErrorMessage(error);
  }

  const title = values.assignment?.trim();
  if (title && title.toLowerCase() !== NA) {
    await invoke<string>("add_assignment", { title });
  }

  await afterDataChange();
  return `Added assignment: ${fieldLabel(values.assignment)} (logged to Excel)`;
}

export async function submitExamRow(
  values: Record<string, string>,
): Promise<CommandResult> {
  try {
    await writeSheetFormRow("exams", values);
  } catch (error) {
    return excelErrorMessage(error);
  }

  const title = values.examName?.trim();
  if (title && title.toLowerCase() !== NA) {
    await invoke<string>("add_exam", { title });
  }

  await afterDataChange();
  return `Added exam: ${fieldLabel(values.examName)} (logged to Excel)`;
}

export async function submitProjectRow(
  values: Record<string, string>,
): Promise<CommandResult> {
  try {
    await writeSheetFormRow("projects", values);
  } catch (error) {
    return excelErrorMessage(error);
  }
  await afterDataChange();
  return `Added project: ${fieldLabel(values.project)} (logged to Excel)`;
}

export async function submitBookRow(
  values: Record<string, string>,
): Promise<CommandResult> {
  try {
    await writeSheetFormRow("books", values);
  } catch (error) {
    return excelErrorMessage(error);
  }

  const title = values.title?.trim();
  const totalPages = Number(values.totalPages);
  if (title && title.toLowerCase() !== NA && !Number.isNaN(totalPages) && totalPages > 0) {
    try {
      await invoke<string>("add_book", { title, totalPages });
    } catch {
      // Keep Excel row even if local JSON already has the book.
    }
  }

  return `Added book: ${fieldLabel(values.title)} (logged to Excel)`;
}

export async function submitTaskRow(
  values: Record<string, string>,
): Promise<CommandResult> {
  const settings = await loadSettings();
  if (!settings.remindersEnabled) {
    return "Reminders integration is disabled. Run: settings remindersEnabled true";
  }

  const title = values.title?.trim();
  const category = values.category?.trim();
  if (!title || title.toLowerCase() === NA) {
    return "Task title is required.";
  }
  if (!category || category.toLowerCase() === NA) {
    return "Task category is required.";
  }
  if (isNa(values.dueDate)) {
    return "Task due date is required.";
  }

  try {
    await writeSheetFormRow("tasks", values);
  } catch (error) {
    return excelErrorMessage(error);
  }

  await syncTaskReminder(values);

  return `Added task: ${title} [${category}] (logged to Excel)`;
}

export async function submitEventRow(
  values: Record<string, string>,
): Promise<CommandResult> {
  const title = values.title?.trim();
  if (!title || title.toLowerCase() === NA) {
    return "Event title is required.";
  }

  try {
    await writeSheetFormRow("events", values);
  } catch (error) {
    return excelErrorMessage(error);
  }

  const { startAt, endAt } = buildEventTimes({
    intent: "event",
    title,
    date: isNa(values.date) ? undefined : values.date,
    startTime: isNa(values.startTime) ? undefined : values.startTime,
    endTime: isNa(values.endTime) ? undefined : values.endTime,
  });

  const response = await createEvent({
    title,
    startAt,
    endAt,
    calendarName: "Local",
  });

  return `${response.message}: ${title} (logged to Excel)`;
}

export async function submitNoteRow(
  values: Record<string, string>,
): Promise<CommandResult> {
  const settings = await loadSettings();
  if (!settings.notesEnabled) {
    return "Notes integration is disabled. Run: settings notesEnabled true";
  }

  try {
    await writeSheetFormRow("notes", values);
  } catch (error) {
    return excelErrorMessage(error);
  }

  const title = values.title?.trim() || NA;
  const content = values.content?.trim() || NA;
  const response = await createAppleNote({ title, content });
  return `${response.message}: ${title} (logged to Excel)`;
}

export async function submitLifeRow(
  values: Record<string, string>,
): Promise<CommandResult> {
  return saveRow("life", values, "Life entry logged");
}

function fieldLabel(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.toLowerCase() !== NA ? trimmed : NA;
}

async function afterDataChange(): Promise<void> {
  await syncDueRemindersQuiet();
}

async function updateRow(
  formId: SheetFormId,
  lookupKey: string,
  values: Record<string, string>,
  message: string,
): Promise<CommandResult> {
  try {
    await updateSheetFormRow(formId, lookupKey, values);
  } catch (error) {
    return excelErrorMessage(error);
  }
  await afterDataChange();
  return `${message} (updated in Excel)`;
}

export async function updateClassRow(
  lookupKey: string,
  values: Record<string, string>,
): Promise<CommandResult> {
  const newName = values.course?.trim();
  if (!newName || newName.toLowerCase() === NA) {
    return "Course is required.";
  }

  if (lookupKey.trim().toLowerCase() !== newName.toLowerCase()) {
    try {
      await invoke<string>("rename_class", { oldName: lookupKey, newName });
    } catch {
      // Planner rename is best-effort when class was Excel-only.
    }
  }

  return updateRow("classes", lookupKey, values, `Updated class: ${fieldLabel(newName)}`);
}

export async function updateAssignmentRow(
  lookupKey: string,
  values: Record<string, string>,
): Promise<CommandResult> {
  const newTitle = values.assignment?.trim();
  if (newTitle && newTitle.toLowerCase() !== NA && newTitle.toLowerCase() !== lookupKey.toLowerCase()) {
    try {
      await invoke<string>("rename_assignment", {
        oldTitle: lookupKey,
        newTitle,
      });
    } catch {
      // Best-effort planner sync.
    }
  }

  return updateRow(
    "assignments",
    lookupKey,
    values,
    `Updated assignment: ${fieldLabel(newTitle ?? lookupKey)}`,
  );
}

export async function updateExamRow(
  lookupKey: string,
  values: Record<string, string>,
): Promise<CommandResult> {
  const newTitle = values.examName?.trim();
  if (newTitle && newTitle.toLowerCase() !== NA && newTitle.toLowerCase() !== lookupKey.toLowerCase()) {
    try {
      await invoke<string>("rename_exam", { oldTitle: lookupKey, newTitle });
    } catch {
      // Best-effort planner sync.
    }
  }

  return updateRow(
    "exams",
    lookupKey,
    values,
    `Updated exam: ${fieldLabel(newTitle ?? lookupKey)}`,
  );
}

export async function updateProjectRow(
  lookupKey: string,
  values: Record<string, string>,
): Promise<CommandResult> {
  return updateRow(
    "projects",
    lookupKey,
    values,
    `Updated project: ${fieldLabel(values.project)}`,
  );
}

export async function updateBookRow(
  lookupKey: string,
  values: Record<string, string>,
): Promise<CommandResult> {
  try {
    await updateSheetFormRow("books", lookupKey, values);
  } catch (error) {
    return excelErrorMessage(error);
  }

  const title = values.title?.trim();
  const totalPages = Number(values.totalPages);
  const currentPage = Number(values.currentPage);
  if (title && title.toLowerCase() !== NA) {
    try {
      await invoke<string>("sync_book_from_excel", {
        oldTitle: lookupKey,
        title,
        totalPages: Number.isNaN(totalPages) ? 0 : totalPages,
        currentPage: Number.isNaN(currentPage) ? 0 : currentPage,
        status: values.status?.trim() || NA,
      });
    } catch {
      // Keep Excel as source of truth.
    }
  }

  return `Updated book: ${fieldLabel(title ?? lookupKey)} (updated in Excel)`;
}

export async function updateTaskRow(
  lookupKey: string,
  values: Record<string, string>,
): Promise<CommandResult> {
  const settings = await loadSettings();
  if (!settings.remindersEnabled) {
    return "Reminders integration is disabled. Run: settings remindersEnabled true";
  }

  const title = values.title?.trim();
  const category = values.category?.trim();
  if (!title || title.toLowerCase() === NA) {
    return "Task title is required.";
  }
  if (!category || category.toLowerCase() === NA) {
    return "Task category is required.";
  }

  let previous: Record<string, string> | undefined;
  try {
    previous = await readSheetFormRow("tasks", lookupKey);
    await updateSheetFormRow("tasks", lookupKey, values);
  } catch (error) {
    return excelErrorMessage(error);
  }

  await syncTaskReminder(values, previous);

  return `Updated task: ${title} [${category}] (updated in Excel)`;
}

export async function updateEventRow(
  lookupKey: string,
  values: Record<string, string>,
): Promise<CommandResult> {
  const title = values.title?.trim();
  if (!title || title.toLowerCase() === NA) {
    return "Event title is required.";
  }

  try {
    await updateSheetFormRow("events", lookupKey, values);
  } catch (error) {
    return excelErrorMessage(error);
  }

  return `Updated event: ${title} (updated in Excel)`;
}

export async function updateNoteRow(
  lookupKey: string,
  values: Record<string, string>,
): Promise<CommandResult> {
  return updateRow("notes", lookupKey, values, `Updated note: ${fieldLabel(values.title)}`);
}

export async function updateLifeRow(
  lookupKey: string,
  values: Record<string, string>,
): Promise<CommandResult> {
  return updateRow("life", lookupKey, values, "Life entry updated");
}
