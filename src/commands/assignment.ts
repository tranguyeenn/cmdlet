/**
 * Track assignments locally.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command, CommandResult } from "../types";
import { submitAssignmentRow, updateAssignmentRow } from "../services/sheetFormSubmit";
import { syncDueRemindersQuiet } from "../services/dueReminders";
import { syncAssignmentDelete, withExcelWarning } from "../services/excelSync";
import { completeSheetRowPrompt } from "../utils/excelRowPrompt";
import { completeSheetRowEditPrompt } from "../utils/sheetEditPrompt";
import { parseSubcommand } from "../utils/parseArgs";
import { listActiveSheetFormRows } from "../utils/activeSheetRows";

function field(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.toLowerCase() !== "n/a" ? trimmed : "";
}

async function listActiveAssignments(): Promise<string> {
  const rows = await listActiveSheetFormRows("assignments");
  if (rows.length === 0) {
    return "No active assignments.";
  }

  return rows
    .map(({ values }) => {
      const due = field(values.dueDate) || "no due date";
      const course = field(values.course);
      const priority = field(values.priority);
      const status = field(values.status);
      const details = [course && `[${course}]`, priority, status].filter(Boolean).join("  ");
      return details
        ? `${due}  ${values.assignment}  ${details}`
        : `${due}  ${values.assignment}`;
    })
    .join("\n");
}

export const assignmentCommand: Command = {
  name: "assignment",
  category: "Academic",
  description: "Add, edit, list, or delete assignments",
  examples: [
    "assignment add",
    "assignment add CS101 | Problem Set 3",
    "assignment edit Problem Set 3",
    "assignment delete Problem Set 3",
    "assignment list",
  ],
  complete(prefix: string): string[] {
    const lower = prefix.toLowerCase();
    return ["add", "edit", "delete", "list"].filter((action) => action.startsWith(lower));
  },
  async execute(args: string): Promise<CommandResult> {
    const { action, rest } = parseSubcommand(args);

    if (!action) {
      return "Examples:\n  assignment add\n  assignment delete <title>\n  assignment list";
    }

    try {
      if (action === "delete" || action === "remove") {
        if (!rest) {
          return "Usage: assignment delete <title>";
        }
        const message = await invoke<string>("delete_assignment", { title: rest });
        const excelError = await syncAssignmentDelete(rest);
        if (!excelError) {
          await syncDueRemindersQuiet();
        }
        return withExcelWarning(message, excelError);
      }

      if (action === "add") {
        return completeSheetRowPrompt("assignments", rest, submitAssignmentRow);
      }

      if (action === "edit") {
        if (!rest) {
          return "Usage: assignment edit <title>";
        }
        return completeSheetRowEditPrompt("assignments", rest, updateAssignmentRow);
      }

      if (action === "list") {
        return listActiveAssignments();
      }

      return "Use add, edit, delete, or list.";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Assignment error: ${message}`;
    }
  },
};
