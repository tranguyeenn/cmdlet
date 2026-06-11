import {
  ensureWorkbookReady,
  logClassToExcel,
  logEventToExcel,
  logNoteToExcel,
  logSimpleAssignmentToExcel,
  logSimpleBookToExcel,
  logSimpleExamToExcel,
  logTaskToExcel,
  removeClassFromExcel,
  removeAssignmentFromExcel,
  removeExamFromExcel,
  removeProjectFromExcel,
  removeBookFromExcel,
  removeEventFromExcel,
  removeTaskFromExcel,
  updateBookProgressInExcel,
  type EventExcelPayload,
  type NoteExcelPayload,
  type TaskExcelPayload,
} from "./secondBrain";

export type { EventExcelPayload, NoteExcelPayload, TaskExcelPayload };

export async function tryExcelSync(fn: () => Promise<void>): Promise<string | null> {
  try {
    await ensureWorkbookReady();
    await fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function withExcelWarning(message: string, excelError: string | null): string {
  if (!excelError) {
    return message;
  }
  return `${message} (Excel sync failed: ${excelError})`;
}

export async function syncTask(payload: TaskExcelPayload): Promise<string | null> {
  return tryExcelSync(() => logTaskToExcel(payload));
}

export async function syncTaskDelete(title: string): Promise<string | null> {
  return tryExcelSync(() => removeTaskFromExcel(title));
}

export async function syncEvent(payload: EventExcelPayload): Promise<string | null> {
  return tryExcelSync(() => logEventToExcel(payload));
}

export async function syncEventDelete(title: string): Promise<string | null> {
  return tryExcelSync(() => removeEventFromExcel(title));
}

export async function syncNote(payload: NoteExcelPayload): Promise<string | null> {
  return tryExcelSync(() => logNoteToExcel(payload));
}

export async function syncClass(name: string): Promise<string | null> {
  return tryExcelSync(() => logClassToExcel(name));
}

export async function syncClassDelete(name: string): Promise<string | null> {
  return tryExcelSync(() => removeClassFromExcel(name));
}

export async function syncAssignmentDelete(title: string): Promise<string | null> {
  return tryExcelSync(() => removeAssignmentFromExcel(title));
}

export async function syncExamDelete(title: string): Promise<string | null> {
  return tryExcelSync(() => removeExamFromExcel(title));
}

export async function syncProjectDelete(name: string): Promise<string | null> {
  return tryExcelSync(() => removeProjectFromExcel(name));
}

export async function syncBookDelete(title: string): Promise<string | null> {
  return tryExcelSync(() => removeBookFromExcel(title));
}

export async function syncSimpleAssignment(title: string): Promise<string | null> {
  return tryExcelSync(() => logSimpleAssignmentToExcel(title));
}

export async function syncSimpleExam(title: string): Promise<string | null> {
  return tryExcelSync(() => logSimpleExamToExcel(title));
}

export async function syncSimpleBook(
  title: string,
  totalPages: number,
  author = "",
): Promise<string | null> {
  return tryExcelSync(() => logSimpleBookToExcel(title, totalPages, author));
}

export async function syncBookProgress(
  title: string,
  currentPage: number,
): Promise<string | null> {
  return tryExcelSync(() => updateBookProgressInExcel(title, currentPage));
}
