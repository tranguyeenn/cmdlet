/**
 * Track books and reading status locally.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command, CommandResult } from "../types";
import { submitBookRow, updateBookRow } from "../services/sheetFormSubmit";
import { syncBookDelete, withExcelWarning } from "../services/excelSync";
import { completeSheetRowPrompt } from "../utils/excelRowPrompt";
import { completeSheetRowEditPrompt } from "../utils/sheetEditPrompt";
import { parseSubcommand } from "../utils/parseArgs";

interface Book {
  title: string;
  totalPages: number;
  currentPage: number;
  status: string;
}

const ACTIONS = ["add", "edit", "delete", "list", "current"];

function formatBookList(books: Book[]): string {
  if (books.length === 0) {
    return "No books saved.";
  }

  return books
    .map((book) => {
      const percent =
        book.totalPages > 0
          ? Math.round((book.currentPage / book.totalPages) * 100)
          : 0;
      return `${book.title}  ${book.currentPage}/${book.totalPages} (${percent}%) — ${book.status}`;
    })
    .join("\n");
}

export const bookCommand: Command = {
  name: "book",
  category: "Reading",
  description: "Add, edit, list, delete, or set your current book",
  examples: [
    "book add",
    "book edit Deep Work",
    "book delete Deep Work",
    "book list",
  ],
  complete(prefix: string): string[] {
    const lower = prefix.toLowerCase();
    return ACTIONS.filter((action) => action.startsWith(lower));
  },
  async execute(args: string): Promise<CommandResult> {
    const { action, rest } = parseSubcommand(args);

    if (!action) {
      return [
        "Examples:",
        "  book add",
        "  book edit <title>",
        "  book delete <title>",
        "  book list",
        "  book current Anna Karenina",
      ].join("\n");
    }

    try {
      if (action === "delete" || action === "remove") {
        if (!rest) {
          return "Usage: book delete <title>";
        }
        const message = await invoke<string>("delete_book", { title: rest });
        const excelError = await syncBookDelete(rest);
        return withExcelWarning(message, excelError);
      }

      if (action === "add") {
        return completeSheetRowPrompt("books", rest, submitBookRow);
      }

      if (action === "edit") {
        if (!rest) {
          return "Usage: book edit <title>";
        }
        return completeSheetRowEditPrompt("books", rest, updateBookRow);
      }

      if (action === "list") {
        const books = await invoke<Book[]>("list_books");
        return formatBookList(books);
      }

      if (action === "current") {
        if (!rest) {
          return "Usage: book current <title>";
        }
        return await invoke<string>("set_current_book", { title: rest });
      }

      return `Unknown book action: ${action}. Use add, edit, delete, list, or current.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Book error: ${message}`;
    }
  },
};
