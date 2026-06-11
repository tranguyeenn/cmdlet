import type { CommandResult } from "../types";
import type { SheetFormId } from "../services/excelRowSchemas";
import { SHEET_FORMS } from "../services/excelRowSchemas";
import { parseTitleAndNumber } from "./parseArgs";

function normalizeAnswer(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.toLowerCase() === "n/a") {
    return "";
  }
  return trimmed;
}

function parsePipeInitialValues(
  args: string,
  fieldKeys: string[],
): Record<string, string> {
  const parts = args.split("|").map((part) => part.trim());
  const values: Record<string, string> = {};
  fieldKeys.forEach((key, index) => {
    const part = parts[index];
    if (part) {
      values[key] = part;
    }
  });
  return values;
}

function parseInitialValues(
  formId: SheetFormId,
  args: string,
): Record<string, string> {
  const trimmed = args.trim();
  if (!trimmed) {
    return {};
  }

  const fieldKeys = SHEET_FORMS[formId].fields.map((field) => field.key);

  if (trimmed.includes("|")) {
    return parsePipeInitialValues(trimmed, fieldKeys);
  }

  if (formId === "books") {
    const parsed = parseTitleAndNumber(trimmed);
    if (parsed) {
      return {
        title: parsed.title,
        totalPages: String(parsed.number),
      };
    }
  }

  const [firstKey] = fieldKeys;
  if (firstKey) {
    return { [firstKey]: trimmed };
  }

  return {};
}

function applyAutoFields(
  formId: SheetFormId,
  values: Record<string, string>,
): Record<string, string> {
  const schema = SHEET_FORMS[formId];
  const next = { ...values };
  for (const autoField of schema.autoFields ?? []) {
    next[autoField.key] = autoField.value();
  }
  return next;
}

function missingFieldIndexFrom(
  formId: SheetFormId,
  values: Record<string, string>,
  startIndex: number,
): number | null {
  const fields = SHEET_FORMS[formId].fields;
  for (let index = startIndex; index < fields.length; index += 1) {
    const key = fields[index].key;
    if (!values[key]?.trim()) {
      return index;
    }
  }
  return null;
}

function firstMissingFieldIndex(
  formId: SheetFormId,
  values: Record<string, string>,
): number | null {
  return missingFieldIndexFrom(formId, values, 0);
}

function buildPromptResult(
  formId: SheetFormId,
  fieldIndex: number,
  values: Record<string, string>,
  finish: (values: Record<string, string>) => Promise<CommandResult>,
): CommandResult {
  const schema = SHEET_FORMS[formId];
  const field = schema.fields[fieldIndex];
  const step = fieldIndex + 1;
  const total = schema.fields.length;
  const hint = field.hint ? `${field.label} (${field.hint})` : field.label;
  const lines = [
    `Adding ${schema.label} (${step}/${total})`,
    `${field.label}?`,
    "Press Enter to leave blank",
  ];
  if (field.hint) {
    lines.splice(2, 0, `Options: ${field.hint}`);
  }

  const handler = async (input: string): Promise<CommandResult> => {
    const nextValues = {
      ...values,
      [field.key]: normalizeAnswer(input),
    };

    // Advance past the field we just prompted so a blank answer is kept blank
    // instead of re-asking the same question. Later fields that are still
    // missing (e.g. not supplied via args) are prompted in turn.
    const nextIndex = missingFieldIndexFrom(formId, nextValues, fieldIndex + 1);
    if (nextIndex === null) {
      return finish(applyAutoFields(formId, nextValues));
    }

    return buildPromptResult(formId, nextIndex, nextValues, finish);
  };

  return {
    output: lines.join("\n"),
    hint,
    followUp: handler,
  };
}

/** Start an interactive prompt chain to fill every column in a sheet row. */
export function startSheetRowPrompt(
  formId: SheetFormId,
  args: string,
  finish: (values: Record<string, string>) => Promise<CommandResult>,
): CommandResult {
  const initial = parseInitialValues(formId, args);
  const nextIndex = firstMissingFieldIndex(formId, initial);
  if (nextIndex === null) {
    return {
      output: "Saving row to Excel...",
      followUp: async () => finish(applyAutoFields(formId, initial)),
    };
  }

  return buildPromptResult(formId, nextIndex, initial, finish);
}

/** Prompt for missing fields, or save immediately when all are provided. */
export async function completeSheetRowPrompt(
  formId: SheetFormId,
  args: string,
  finish: (values: Record<string, string>) => Promise<CommandResult>,
): Promise<CommandResult> {
  const initial = parseInitialValues(formId, args);
  const nextIndex = firstMissingFieldIndex(formId, initial);
  if (nextIndex === null) {
    return finish(applyAutoFields(formId, initial));
  }
  return startSheetRowPrompt(formId, args, finish);
}
