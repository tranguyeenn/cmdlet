/**
 * Parses raw user input and routes it to the matching command handler.
 */
import { resolveExecutableCommand } from "./commands";
import { timeAsync } from "./lib/perf";
import type { CommandResult, ParsedInput } from "./types";

type FollowUpHandler = (input: string) => Promise<CommandResult>;

let activeFollowUp: FollowUpHandler | null = null;
let followUpHint: string | null = null;

/** Whether the palette is waiting for follow-up input (e.g. song number). */
export function isFollowUpActive(): boolean {
  return activeFollowUp !== null;
}

/** Hint text for the current follow-up step, if any. */
export function getFollowUpHint(): string | null {
  return followUpHint;
}

/** Cancel any pending interactive command step. */
export function clearFollowUp(): void {
  activeFollowUp = null;
  followUpHint = null;
}

async function runResult(result: CommandResult): Promise<string> {
  if (typeof result === "string") {
    activeFollowUp = null;
    followUpHint = null;
    return result;
  }

  if (result.followUp) {
    const followUp = result.followUp;
    activeFollowUp = async (input: string) => followUp(input);
    followUpHint = result.hint ?? null;
  } else {
    activeFollowUp = null;
    followUpHint = null;
  }

  return result.output;
}

/** Split input into command name and trailing arguments. */
export function parseInput(input: string): ParsedInput {
  const trimmed = input.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return { commandName: trimmed.toLowerCase(), args: "" };
  }

  return {
    commandName: trimmed.slice(0, spaceIndex).toLowerCase(),
    args: trimmed.slice(spaceIndex + 1).trim(),
  };
}

/** Execute a palette command and return its output string. */
export async function executeCommand(input: string): Promise<string> {
  return timeAsync("command.execute", async () => {
    const trimmed = input.trim();
    if (!trimmed && !activeFollowUp) {
      return "";
    }

    if (activeFollowUp) {
      const handler = activeFollowUp;
      const next = await timeAsync("command.followUp", () => handler(trimmed));
      return runResult(next);
    }

    const { commandName, args } = parseInput(trimmed);
    const command = await resolveExecutableCommand(commandName);

    if (!command) {
      return `Unknown command: ${commandName}. Type "help" or "help <command>" for examples.`;
    }

    const result = await timeAsync(`command.run.${command.name}`, async () =>
      command.execute(args),
    );
    return runResult(result);
  });
}
