/**
 * Command registry. Import new commands here to make them available in the palette.
 */
import type { Command } from "../types";
import {
  catalogCommands,
  brainCommand,
  lifeCommand,
  projectCommand,
  reminderCommand,
  spotifyCommand,
  webCommand,
} from "./catalog";
import { groupCommandsByCategory } from "./group";
import { helpCommand } from "./help";

export const commandCategories = groupCommandsByCategory([
  ...catalogCommands,
  helpCommand,
]);

export const commands: Command[] = [...catalogCommands, helpCommand];

/** All registered commands (includes help). */
export function allCommands(): Command[] {
  return [...catalogCommands, helpCommand];
}

/** Legacy command names kept for compatibility. */
export const commandAliases = new Map<string, Command>([
  ["sp", spotifyCommand],
  ["search", webCommand],
  ["remind", reminderCommand],
]);

/** Resolve a command by name (rebuilt each call so dev HMR picks up new commands). */
export function resolveCommand(name: string): Command | undefined {
  const lower = name.toLowerCase();
  const alias = commandAliases.get(lower);
  if (alias) {
    return alias;
  }
  return allCommands().find((command) => command.name === lower);
}

/** Lookup map for fast command resolution by name. */
export function getCommandMap(): Map<string, Command> {
  return new Map([
    ...commands.map((command) => [command.name, command] as const),
    ...commandAliases.entries(),
  ]);
}

/** @deprecated Use resolveCommand() — kept for autocomplete. */
export const commandMap = getCommandMap();

export { helpCommand } from "./help";
export { brainCommand, lifeCommand, projectCommand };
