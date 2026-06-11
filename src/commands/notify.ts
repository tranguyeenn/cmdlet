/**
 * Fire a macOS notification on demand to verify the notification pipeline.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command } from "../types";

export const notifyCommand: Command = {
  name: "notify",
  category: "Utilities",
  description: "Send a test notification to check notifications are working",
  examples: ["notify", "notify hello from cmdlet"],
  complete(prefix: string): string[] {
    const lower = prefix.toLowerCase();
    return ["test"].filter((item) => item.startsWith(lower));
  },
  async execute(args: string): Promise<string> {
    const body = args.trim() || "Notifications are working.";

    try {
      // Urgent so it breaks through Do Not Disturb / Focus for the test.
      await invoke("notify", { title: "cmdlet", body, urgent: true });
      return `Sent an urgent alert: "${body}". It should sound and pop a dialog even with Do Not Disturb on.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Notification failed: ${message}`;
    }
  },
};
