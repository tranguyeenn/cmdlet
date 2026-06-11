/**
 * Clears on-screen command output history.
 */
import type { Command } from "../types";

export const clearCommand: Command = {
  name: "clear",
  category: "System",
  description: "Clear the command output history",
  examples: ["clear"],
  execute(): string {
    return "";
  },
};
