/**
 * Start a countdown timer with a macOS notification.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command } from "../types";

export const timerCommand: Command = {
  name: "timer",
  category: "Utilities",
  description: "Start a timer (e.g. timer 5m, timer 30s, timer 1h)",
  examples: ["timer 30s", "timer 5m", "timer 1h"],
  complete(prefix: string): string[] {
    const samples = ["30s", "5m", "10m", "1h"];
    const lower = prefix.toLowerCase();
    return samples.filter((sample) => sample.startsWith(lower));
  },
  async execute(args: string): Promise<string> {
    const duration = args.trim();
    if (!duration) {
      return "Usage: timer <duration>  examples: 30s, 5m, 1h";
    }

    try {
      return await invoke<string>("start_timer", { duration });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Timer failed: ${message}`;
    }
  },
};
