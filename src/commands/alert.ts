/**
 * Sync Apple Reminders for upcoming assignments, exams, and daily logs.
 */
import type { Command } from "../types";
import { syncDueReminders } from "../services/dueReminders";
import { parseSubcommand } from "../utils/parseArgs";

export const alertCommand: Command = {
  name: "alert",
  category: "Productivity",
  description: "Sync native Apple Reminders for due dates and daily logs",
  examples: [
    "alert sync",
    "reminder drink water daily",
    "settings dueRemindersEnabled true",
  ],
  complete(prefix: string): string[] {
    const lower = prefix.toLowerCase();
    return ["sync"].filter((item) => item.startsWith(lower));
  },
  async execute(args: string): Promise<string> {
    const { action } = parseSubcommand(args.trim());

    if (action === "sync" || !action) {
      try {
        return await syncDueReminders();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Alert sync failed: ${message}`;
      }
    }

    return "Usage: alert sync";
  },
};
