/**
 * Create notes in Apple Notes from the terminal.
 */
import type { Command, CommandResult } from "../types";
import { getNoteHistory } from "../storage/noteStore";
import { submitNoteRow, updateNoteRow } from "../services/sheetFormSubmit";
import { examplesBlock } from "../utils/hubExecute";
import { completeSheetRowPrompt } from "../utils/excelRowPrompt";
import { completeSheetRowEditPrompt } from "../utils/sheetEditPrompt";
import { parseSubcommand } from "../utils/parseArgs";

const EXAMPLES = [
  "note add",
  "note list",
  "note edit meeting notes",
];

async function listRecentNotes(): Promise<CommandResult> {
  try {
    const history = await getNoteHistory();
    if (history.length === 0) {
      return "No recent notes.";
    }

    return history
      .map((entry) => `${entry.title}  ${entry.content.slice(0, 80)}`)
      .join("\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to load note history: ${message}`;
  }
}

export const noteCommand: Command = {
  name: "note",
  category: "Productivity",
  description: "Create notes in Apple Notes (Cmdlet Notes folder)",
  examples: EXAMPLES,
  complete(prefix: string): string[] {
    const samples = ["list", "add", "edit"];
    const lower = prefix.toLowerCase();
    return samples.filter((sample) => sample.startsWith(lower));
  },
  async execute(args: string): Promise<CommandResult> {
    const trimmed = args.trim();
    const { action, rest } = parseSubcommand(trimmed);

    if (action === "list") {
      return listRecentNotes();
    }

    if (action === "edit") {
      if (!rest) {
        return "Usage: note edit <title>";
      }
      return completeSheetRowEditPrompt("notes", rest, updateNoteRow);
    }

    if (!trimmed) {
      return examplesBlock(EXAMPLES);
    }

    const workArgs = action === "add" ? rest : trimmed;
    return completeSheetRowPrompt("notes", workArgs, submitNoteRow);
  },
};
