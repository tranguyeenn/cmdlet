import type { CommandResult } from "../types";
import type { SheetFormId } from "../services/excelRowSchemas";
import { SHEET_FORMS } from "../services/excelRowSchemas";

export type EditFinish = (
  lookupKey: string,
  values: Record<string, string>,
) => Promise<CommandResult>;

/**
 * Value to store for a field given the user's input. An empty input (the user
 * pressed Enter) keeps the real current value — never the "(blank)" display
 * placeholder.
 */
export function keepOrReplace(currentValue: string, input: string): string {
  return input.trim() ? input.trim() : currentValue;
}

/**
 * True only when the caller already supplied every field via the pipe syntax
 * (`edit <key> | f1 | f2 | ...`), so the interactive walk can be skipped. The
 * decision keys off the *explicit updates*, not the merged existing row — an
 * existing row is always fully populated, so keying off it would skip the walk
 * every time (the bug this guards against).
 */
export function shouldSkipWalk(
  formId: SheetFormId,
  updates: Record<string, string>,
): boolean {
  return SHEET_FORMS[formId].fields.every((field) =>
    Boolean(updates[field.key]?.trim()),
  );
}

/**
 * Build the prompt for one field of an edit walk. The returned `followUp`
 * applies the answer (Enter keeps current), then either recurses to the next
 * field or calls `finish` after the last one.
 */
export function buildEditPromptResult(
  formId: SheetFormId,
  lookupKey: string,
  fieldIndex: number,
  values: Record<string, string>,
  finish: EditFinish,
): CommandResult {
  const schema = SHEET_FORMS[formId];
  const field = schema.fields[fieldIndex];
  const step = fieldIndex + 1;
  const total = schema.fields.length;
  // Keep the real current value distinct from its display: pressing Enter must
  // preserve the actual cell value (e.g. "" or "n/a"), not the "(blank)" label.
  const currentValue = values[field.key]?.trim() ?? "";
  const currentDisplay = currentValue || "(blank)";
  const hint = field.hint ? `${field.label} (${field.hint})` : field.label;
  const lines = [
    `Editing ${schema.label}: ${lookupKey} (${step}/${total})`,
    `${field.label}? (current: ${currentDisplay})`,
    "Press Enter to keep current",
  ];
  if (field.hint) {
    lines.splice(2, 0, `Options: ${field.hint}`);
  }

  const handler = async (input: string): Promise<CommandResult> => {
    const nextValues = {
      ...values,
      [field.key]: keepOrReplace(currentValue, input),
    };

    const nextIndex = fieldIndex + 1;
    if (nextIndex >= schema.fields.length) {
      return finish(lookupKey, nextValues);
    }

    return buildEditPromptResult(formId, lookupKey, nextIndex, nextValues, finish);
  };

  return {
    output: lines.join("\n"),
    hint,
    followUp: handler,
  };
}
