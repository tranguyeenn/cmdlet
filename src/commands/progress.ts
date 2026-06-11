/**
 * Update reading progress for a book.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command } from "../types";
import { syncBookProgress, withExcelWarning } from "../services/excelSync";
import { parseTitleAndProgress } from "../utils/parseArgs";

export const progressCommand: Command = {
  name: "progress",
  category: "Reading",
  description: "Set or increment reading progress for a book",
  examples: [
    "progress Anna Karenina 120",
    "progress Anna Karenina +50",
  ],
  async execute(args: string): Promise<string> {
    const trimmed = args.trim();
    if (!trimmed) {
      return [
        "Examples:",
        "  progress Anna Karenina 120",
        "  progress Anna Karenina +50",
      ].join("\n");
    }

    const parsed = parseTitleAndProgress(trimmed);
    if (!parsed) {
      return "Usage: progress <title> <currentPage> or progress <title> +<pagesRead>";
    }

    try {
      const message = await invoke<string>("update_book_progress", {
        title: parsed.title,
        value: parsed.value,
      });

      const pageMatch = /:\s*(\d+)\//.exec(message);
      const excelError = pageMatch
        ? await syncBookProgress(parsed.title, Number(pageMatch[1]))
        : null;

      return withExcelWarning(message, excelError);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Progress error: ${message}`;
    }
  },
};
