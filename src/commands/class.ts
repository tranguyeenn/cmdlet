/**
 * Track academic classes locally.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command, CommandResult } from "../types";
import { submitClassRow, updateClassRow } from "../services/sheetFormSubmit";
import { syncClassDelete, withExcelWarning } from "../services/excelSync";
import { completeSheetRowPrompt } from "../utils/excelRowPrompt";
import { completeSheetRowEditPrompt } from "../utils/sheetEditPrompt";
import { parseSubcommand } from "../utils/parseArgs";

interface ClassEntry {
  name: string;
}

export const classCommand: Command = {
  name: "class",
  category: "Academic",
  description: "Add, list, or delete classes",
  examples: ["class add", "class edit Calculus II", "class delete Calculus II", "class list"],
  complete(prefix: string): string[] {
    const lower = prefix.toLowerCase();
    return ["add", "edit", "delete", "list"].filter((action) => action.startsWith(lower));
  },
  async execute(args: string): Promise<CommandResult> {
    const { action, rest } = parseSubcommand(args);

    if (!action) {
      return "Examples:\n  class add\n  class add Calculus II\n  class delete Calculus II\n  class list";
    }

    try {
      if (action === "delete" || action === "remove") {
        if (!rest) {
          return "Usage: class delete <name>";
        }
        const message = await invoke<string>("delete_class", { name: rest });
        const excelError = await syncClassDelete(rest);
        return withExcelWarning(message, excelError);
      }

      if (action === "add") {
        return completeSheetRowPrompt("classes", rest, submitClassRow);
      }

      if (action === "edit") {
        if (!rest) {
          return "Usage: class edit <course name>";
        }
        return completeSheetRowEditPrompt("classes", rest, updateClassRow);
      }

      if (action === "list") {
        const classes = await invoke<ClassEntry[]>("list_classes");
        if (classes.length === 0) {
          return "No classes saved.";
        }
        return classes.map((entry) => entry.name).join("\n");
      }

      return "Use add, edit, delete, or list.";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Class error: ${message}`;
    }
  },
};
