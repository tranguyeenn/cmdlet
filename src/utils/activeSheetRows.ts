import type { SheetFormId } from "../services/excelRowSchemas";
import { listSheetFormRows } from "../services/secondBrain";

export interface SheetFormRow {
  key: string;
  values: Record<string, string>;
}

const HIDDEN_STATUSES = new Set(["done", "finished"]);

export function isCompletedForDisplay(
  formId: SheetFormId,
  values: Record<string, string>,
): boolean {
  if (formId === "books") {
    return false;
  }

  const status = values.status ?? values.studyStatus;
  return HIDDEN_STATUSES.has(status?.trim().toLowerCase() ?? "");
}

export async function listActiveSheetFormRows(
  formId: SheetFormId,
): Promise<SheetFormRow[]> {
  const rows = await listSheetFormRows(formId);
  return rows.filter((row) => !isCompletedForDisplay(formId, row.values));
}
