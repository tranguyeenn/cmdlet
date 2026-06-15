/**
 * Lightweight command registry. Keep this file free of command implementation
 * imports so help/autocomplete do not pull Excel, Reminders, or Calendar code
 * into the initial app load.
 */
import type { Command } from "../types";
import { timeAsync } from "../lib/perf";
import { loadCommand } from "./loaders";
import {
  allCommandSpecs,
  commandAliases,
  commandSpecs,
  resolveCommandSpec,
  type CommandSpec,
} from "./specs";
import { groupCommandsByCategory } from "./group";

export const commandCategories = groupCommandsByCategory(commandSpecs);
export const commands: CommandSpec[] = commandSpecs;

/** All registered command metadata (includes help). */
export function allCommands(): CommandSpec[] {
  return allCommandSpecs();
}

/** Resolve command metadata by name or alias. */
export function resolveCommand(name: string): CommandSpec | undefined {
  return resolveCommandSpec(name);
}

/** Load the executable command implementation by name or alias. */
export async function resolveExecutableCommand(name: string): Promise<Command | undefined> {
  const spec = resolveCommandSpec(name);
  if (!spec) {
    return undefined;
  }

  const command = loadCommand(spec.name);
  if (!command) {
    return undefined;
  }

  return timeAsync(`command.load.${spec.name}`, () => command);
}

/** Lookup map for metadata by name. */
export function getCommandMap(): Map<string, CommandSpec> {
  return new Map([
    ...commands.map((command) => [command.name, command] as const),
    ...[...commandAliases.entries()].map(([alias, canonical]) => [
      alias,
      resolveCommandSpec(canonical)!,
    ] as const),
  ]);
}

/** @deprecated Use resolveCommand() — kept for autocomplete. */
export const commandMap = getCommandMap();
