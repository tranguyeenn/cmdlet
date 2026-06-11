/**
 * Open a web search in Firefox (or the browser set in settings).
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command } from "../types";

export const webCommand: Command = {
  name: "web",
  category: "Navigation",
  description: "Search the web in Firefox",
  examples: ["web rust ownership", "web weather today"],
  async execute(args: string): Promise<string> {
    const query = args.trim();
    if (!query) {
      return "Examples:\n  web rust ownership\n  web weather today";
    }

    try {
      return await invoke<string>("web_search", { query });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Search failed: ${message}`;
    }
  },
};
