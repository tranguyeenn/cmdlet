/**
 * Opens macOS applications via the system `open` command.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command } from "../types";

export const openCommand: Command = {
  name: "open",
  category: "System",
  description: "Launch a macOS application (e.g. open Spotify)",
  examples: ["open Spotify", "open Safari", "open Terminal"],
  async execute(args: string): Promise<string> {
    const appName = args.trim();
    if (!appName) {
      return "Usage: open <app>";
    }

    try {
      return await invoke<string>("open_app", { appName });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Failed to open app: ${message}`;
    }
  },
};
