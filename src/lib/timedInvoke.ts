import { invoke } from "@tauri-apps/api/core";
import { timeAsync } from "./perf";

export function timedInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
  label = `invoke.${command}`,
): Promise<T> {
  return timeAsync(label, () => invoke<T>(command, args));
}
