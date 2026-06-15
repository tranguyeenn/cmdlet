/**
 * Track exams locally.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command, CommandResult } from "../types";
import { submitExamRow, updateExamRow } from "../services/sheetFormSubmit";
import { syncExamDelete, withExcelWarning } from "../services/excelSync";
import { completeSheetRowPrompt } from "../utils/excelRowPrompt";
import { completeSheetRowEditPrompt } from "../utils/sheetEditPrompt";
import { parseSubcommand } from "../utils/parseArgs";
import { listActiveSheetFormRows } from "../utils/activeSheetRows";

function field(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.toLowerCase() !== "n/a" ? trimmed : "";
}

async function listActiveExams(): Promise<string> {
  const rows = await listActiveSheetFormRows("exams");
  if (rows.length === 0) {
    return "No active exams.";
  }

  return rows
    .map(({ values }) => {
      const date = field(values.examDate) || "no date";
      const course = field(values.course);
      const status = field(values.studyStatus);
      const details = [course && `[${course}]`, status].filter(Boolean).join("  ");
      return details ? `${date}  ${values.examName}  ${details}` : `${date}  ${values.examName}`;
    })
    .join("\n");
}

export const examCommand: Command = {
  name: "exam",
  category: "Academic",
  description: "Add, edit, list, or delete exams",
  examples: [
    "exam add",
    "exam add CS101 | Midterm",
    "exam edit Midterm",
    "exam delete Midterm",
    "exam list",
  ],
  complete(prefix: string): string[] {
    const lower = prefix.toLowerCase();
    return ["add", "edit", "delete", "list"].filter((action) => action.startsWith(lower));
  },
  async execute(args: string): Promise<CommandResult> {
    const { action, rest } = parseSubcommand(args);

    if (!action) {
      return "Examples:\n  exam add\n  exam edit <title>\n  exam delete <title>\n  exam list";
    }

    try {
      if (action === "delete" || action === "remove") {
        if (!rest) {
          return "Usage: exam delete <title>";
        }
        const message = await invoke<string>("delete_exam", { title: rest });
        const excelError = await syncExamDelete(rest);
        return withExcelWarning(message, excelError);
      }

      if (action === "add") {
        return completeSheetRowPrompt("exams", rest, submitExamRow);
      }

      if (action === "edit") {
        if (!rest) {
          return "Usage: exam edit <title>";
        }
        return completeSheetRowEditPrompt("exams", rest, updateExamRow);
      }

      if (action === "list") {
        return listActiveExams();
      }

      return "Use add, edit, delete, or list.";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Exam error: ${message}`;
    }
  },
};
