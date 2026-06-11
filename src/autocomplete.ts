/**
 * Tab completion for palette commands and subcommands.
 */
import { allCommands, resolveCommand } from "./commands";

/** Return matching completions for the current input. */
export function getCompletions(input: string): string[] {
  const trimmed = input.trimStart();
  if (!trimmed) {
    return allCommands().map((command) => command.name).sort();
  }

  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    const prefix = trimmed.toLowerCase();
    return allCommands()
      .map((command) => command.name)
      .filter((name) => name.startsWith(prefix))
      .sort();
  }

  const commandName = trimmed.slice(0, spaceIndex).toLowerCase();
  const argsPrefix = trimmed.slice(spaceIndex + 1);
  const command = resolveCommand(commandName);
  if (!command?.complete) {
    return [];
  }

  return command.complete(argsPrefix);
}

/** Longest shared prefix across completion candidates. */
export function longestCommonPrefix(items: string[]): string {
  if (items.length === 0) {
    return "";
  }

  let prefix = items[0];
  for (const item of items.slice(1)) {
    while (!item.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) {
        return "";
      }
    }
  }

  return prefix;
}

/** Replace the token being completed with the chosen value. */
export function applyCompletion(input: string, completion: string): string {
  const leading = input.slice(0, input.length - input.trimStart().length);
  const trimmed = input.trimStart();
  const spaceIndex = trimmed.indexOf(" ");

  if (spaceIndex === -1) {
    return `${leading}${completion} `;
  }

  const commandPart = trimmed.slice(0, spaceIndex);
  return `${leading}${commandPart} ${completion} `;
}

/** Current partial token being completed. */
export function currentToken(input: string): string {
  const trimmed = input.trimStart();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return trimmed.toLowerCase();
  }

  return trimmed.slice(spaceIndex + 1);
}
