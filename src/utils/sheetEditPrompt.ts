import type { CommandResult } from "../types";
import type { SheetFormId } from "../services/excelRowSchemas";
import { SHEET_FORMS } from "../services/excelRowSchemas";
import { readSheetFormRow } from "../services/secondBrain";
import { parseSubcommand } from "./parseArgs";
import { buildEditPromptResult, shouldSkipWalk } from "./sheetEditWalk";


function todayLabel(): string {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Split edit args into lookup key and optional pipe-prefilled field updates. */
export function parseEditArgs(
  formId: SheetFormId,
  args: string,
): { lookup: string; updates: Record<string, string> } {
  const trimmed = args.trim();
  if (!trimmed) {
    return { lookup: "", updates: {} };
  }

  const fieldKeys = SHEET_FORMS[formId].fields.map((field) => field.key);

  if (trimmed.includes("|")) {
    const parts = trimmed.split("|").map((part) => part.trim());
    const lookup = parts[0] ?? "";
    const updates: Record<string, string> = {};
    fieldKeys.forEach((key, index) => {
      const part = parts[index + 1];
      if (part) {
        updates[key] = part;
      }
    });
    return { lookup, updates };
  }

  return { lookup: trimmed, updates: {} };
}

function resolveLifeLookup(lookup: string): string {
  const normalized = lookup.trim().toLowerCase();
  if (!normalized || normalized === "today") {
    return todayLabel();
  }
  return lookup.trim();
}

async function loadExistingRow(
  formId: SheetFormId,
  lookup: string,
): Promise<Record<string, string>> {
  const resolvedLookup = formId === "life" ? resolveLifeLookup(lookup) : lookup;
  return readSheetFormRow(formId, resolvedLookup);
}

/** Interactive edit: load row from Excel, walk fields, Enter keeps current value. */
export async function completeSheetRowEditPrompt(
  formId: SheetFormId,
  args: string,
  finish: (
    lookupKey: string,
    values: Record<string, string>,
    previousValues?: Record<string, string>,
  ) => Promise<CommandResult>,
): Promise<CommandResult> {
  const { lookup, updates } = parseEditArgs(formId, args);
  if (!lookup.trim()) {
    const lookupField = SHEET_FORMS[formId].lookupField;
    return `Usage: edit <${lookupField}> [| field | field ...]`;
  }

  const resolvedLookup = formId === "life" ? resolveLifeLookup(lookup) : lookup;

  let existing: Record<string, string>;
  try {
    existing = await loadExistingRow(formId, lookup);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message;
  }

  const merged = { ...existing, ...updates };
  // Only skip the interactive walk when the caller pre-supplied every field via
  // the pipe syntax. Otherwise walk every field so the user can review each one —
  // Enter keeps the current value.
  if (shouldSkipWalk(formId, updates)) {
    return finish(resolvedLookup, merged, existing);
  }

  return buildEditPromptResult(formId, resolvedLookup, 0, merged, finish, existing);
}

/** Parse `entity edit ...` args where action is already stripped. */
export function parseEditRest(args: string): string {
  const { rest } = parseSubcommand(args);
  return rest || args.trim();
}
