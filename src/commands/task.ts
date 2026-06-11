/**
 * Create tasks in Apple Reminders with category and due date.
 */
import type { Command, CommandResult } from "../types";
import {
  deleteReminder,
} from "../storage/reminderStore";
import { loadSettings } from "../storage/settingsStore";
import { submitTaskRow, updateTaskRow } from "../services/sheetFormSubmit";
import { syncTaskDelete, withExcelWarning } from "../services/excelSync";
import { readSheetFormRow } from "../services/secondBrain";
import { examplesBlock } from "../utils/hubExecute";
import { completeSheetRowPrompt } from "../utils/excelRowPrompt";
import { completeSheetRowEditPrompt } from "../utils/sheetEditPrompt";
import { parseSubcommand } from "../utils/parseArgs";
import { listActiveSheetFormRows } from "../utils/activeSheetRows";

function stripActionPrefix(args: string, action: string): string {
  const trimmed = args.trim();
  const match = new RegExp(`^${action}\\s+`, "i");
  return trimmed.replace(match, "").trim();
}

function field(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.toLowerCase() !== "n/a" ? trimmed : "";
}

async function listActiveTasks(): Promise<CommandResult> {
  try {
    const rows = await listActiveSheetFormRows("tasks");
    if (rows.length === 0) {
      return "No active tasks.";
    }

    return rows
      .map(({ values }) => {
        const dueDate = field(values.dueDate) || "no due date";
        const dueTime = field(values.dueTime);
        const category = field(values.category);
        const status = field(values.status);
        const due = dueTime ? `${dueDate} ${dueTime}` : dueDate;
        const details = [category && `[${category}]`, status].filter(Boolean).join("  ");
        return details ? `${due}  ${values.title}  ${details}` : `${due}  ${values.title}`;
      })
      .join("\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to load tasks: ${message}`;
  }
}

const EXAMPLES = [
  "task add",
  "task add Finish DSA homework | School",
  "task list",
  "task edit Finish DSA homework",
];

export const taskCommand: Command = {
  name: "task",
  category: "Productivity",
  description: "Create tasks in Apple Reminders with category and due date",
  examples: EXAMPLES,
  complete(prefix: string): string[] {
    const samples = ["list", "delete", "add", "edit"];
    const lower = prefix.toLowerCase();
    return samples.filter((sample) => sample.startsWith(lower));
  },
  async execute(args: string): Promise<CommandResult> {
    const trimmed = args.trim();
    const { action } = parseSubcommand(trimmed);

    if (!trimmed) {
      return examplesBlock(EXAMPLES);
    }

    if (action === "list") {
      return listActiveTasks();
    }

    if (action === "delete" || action === "remove") {
      const title = parseSubcommand(trimmed).rest.trim();
      if (!title) {
        return "Usage: task delete <title>";
      }

      try {
        const settings = await loadSettings();
        if (!settings.remindersEnabled) {
          return "Reminders integration is disabled. Run: settings remindersEnabled true";
        }

        let listName: string | undefined;
        try {
          const existing = await readSheetFormRow("tasks", title);
          listName = field(existing.category);
        } catch {
          // Fall back to reminder history/default list if the Excel row is missing.
        }
        const response = await deleteReminder({ title, listName });
        const excelError = await syncTaskDelete(title);
        return withExcelWarning(response.message, excelError);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Failed to delete task: ${message}`;
      }
    }

    if (action === "edit") {
      const title = parseSubcommand(trimmed).rest.trim();
      if (!title) {
        return "Usage: task edit <title>";
      }
      return completeSheetRowEditPrompt("tasks", title, updateTaskRow);
    }

    if (action === "add") {
      return completeSheetRowPrompt("tasks", stripActionPrefix(trimmed, "add"), submitTaskRow);
    }

    const workArgs = stripActionPrefix(trimmed, "add");
    return completeSheetRowPrompt("tasks", workArgs, submitTaskRow);
  },
};
