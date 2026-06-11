/**
 * Show planner overview with reading progress.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command } from "../types";

export const dashboardCommand: Command = {
  name: "dashboard",
  category: "Overview",
  description: "Show current books and planner summary",
  examples: ["dashboard"],
  async execute(): Promise<string> {
    try {
      return await invoke<string>("planner_dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Dashboard error: ${message}`;
    }
  },
};
