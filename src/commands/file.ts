/**
 * Search for files via Spotlight and open by number.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command, CommandResult } from "../types";

interface FileMatch {
  path: string;
  name: string;
}

function formatFileList(matches: FileMatch[]): string {
  const lines = matches.map(
    (match, index) => `${index + 1}. ${match.name}  (${match.path})`,
  );
  lines.push("", "Type a number to open:");
  return lines.join("\n");
}

function buildPickHandler(matches: FileMatch[]): (input: string) => Promise<CommandResult> {
  return async (input: string): Promise<CommandResult> => {
    const choice = Number.parseInt(input.trim(), 10);
    if (!Number.isInteger(choice) || choice < 1 || choice > matches.length) {
      return {
        output: `Pick a number between 1 and ${matches.length}.`,
        followUp: buildPickHandler(matches),
      };
    }

    const match = matches[choice - 1];
    try {
      return await invoke<string>("open_file", { path: match.path });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Failed to open file: ${message}`;
    }
  };
}

export const fileCommand: Command = {
  name: "file",
  category: "Navigation",
  description: "Search files and open by number",
  examples: ["file report.pdf", "file budget.xlsx"],
  async execute(args: string): Promise<CommandResult> {
    const query = args.trim();
    if (!query) {
      return "Examples:\n  file report.pdf\n  file budget.xlsx";
    }

    try {
      const matches = await invoke<FileMatch[]>("search_files", { query });
      if (matches.length === 0) {
        return `No files found for "${query}".`;
      }

      return {
        output: formatFileList(matches),
        followUp: buildPickHandler(matches),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `File search failed: ${message}`;
    }
  },
};
