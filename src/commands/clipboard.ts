/**
 * Read from or write to the system clipboard.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command } from "../types";

export const clipboardCommand: Command = {
  name: "clipboard",
  category: "Utilities",
  description: "Read clipboard, or copy text with: clipboard <text>",
  examples: ["clipboard", "clipboard hello world"],
  async execute(args: string): Promise<string> {
    const trimmed = args.trim();
    if (!trimmed) {
      try {
        const text = await invoke<string>("read_clipboard");
        return text || "(clipboard is empty)";
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Failed to read clipboard: ${message}`;
      }
    }

    try {
      return await invoke<string>("write_clipboard", { text: trimmed });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Failed to write clipboard: ${message}`;
    }
  },
};
