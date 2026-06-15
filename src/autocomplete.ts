/**
 * Tab completion for palette commands and subcommands.
 */
import { allCommands, resolveCommand } from "./commands";
import { timeSync } from "./lib/perf";

const completionCache = new Map<string, string[]>();

function cachedCompletion(key: string, compute: () => string[]): string[] {
  const cached = completionCache.get(key);
  if (cached) {
    return cached;
  }

  const items = compute();
  completionCache.set(key, items);
  return items;
}

/** Return matching completions for the current input. */
export function getCompletions(input: string): string[] {
  return timeSync("autocomplete.filter", () => {
    const trimmed = input.trimStart();
    const cacheKey = trimmed.toLowerCase();
    if (!trimmed) {
      return cachedCompletion(cacheKey, () =>
        allCommands().map((command) => command.name).sort(),
      );
    }

    const spaceIndex = trimmed.indexOf(" ");
    if (spaceIndex === -1) {
      const prefix = trimmed.toLowerCase();
      return cachedCompletion(cacheKey, () =>
        allCommands()
          .map((command) => command.name)
          .filter((name) => name.startsWith(prefix))
          .sort(),
      );
    }

    const commandName = trimmed.slice(0, spaceIndex).toLowerCase();
    const argsPrefix = trimmed.slice(spaceIndex + 1);
    const command = resolveCommand(commandName);
    if (!command?.completions) {
      return [];
    }

    const lower = argsPrefix.toLowerCase();
    return cachedCompletion(cacheKey, () =>
      command.completions!.filter((item) => item.toLowerCase().startsWith(lower)),
    );
  });
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
