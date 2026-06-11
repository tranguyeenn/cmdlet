/**
 * Export planner data to JSON.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command } from "../types";

export const exportCommand: Command = {
  name: "export",
  category: "Overview",
  description: "Export planner data to planner-export.json",
  examples: ["export"],
  async execute(): Promise<string> {
    try {
      return await invoke<string>("planner_export");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Export error: ${message}`;
    }
  },
};
