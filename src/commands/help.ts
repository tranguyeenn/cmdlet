/**
 * Lists all registered palette commands and shows per-command usage.
 */
import type { Command } from "../types";
import { allCommandSpecs, resolveCommandSpec, type CommandSpec } from "./specs";

const HELP_OVERVIEW = `open       Launch a macOS application (e.g. open Spotify)
calc       Evaluate a math expression (e.g. calc 5*8)
clear      Clear the command output history
help       Show available commands or usage for one command
class      Add or list classes
assignment Add or list assignments
exam       Add or list exams
note       Save a note locally (e.g. note buy groceries)
task       Create tasks or list upcoming ones with task list
event      Create events or list upcoming ones; add --sync for Calendar (+ Reminder)
book       Add, list, or set your current book
brain      Create/open Excel second brain workbook
project    Add projects to second brain
life       Log daily life stats in second brain
progress   Set or increment reading progress for a book
dashboard  Show current books and planner summary
export     Export planner data to planner-export.json
web        Search the web in Firefox
file       Search files and open by number
spotify    Spotify: now, pause, play, next, prev, or play a song
timer      Start a timer (e.g. timer 5m, timer 30s, timer 1h)
clipboard  Read clipboard, or copy text with: clipboard <text>
settings   View or change app settings

Type "help <command>" for examples.`;

function formatCommandHelp(command: CommandSpec): string {
  const lines = [command.name, command.description, "", "Examples:"];

  if (command.examples.length) {
    for (const line of command.examples) {
      lines.push(`  ${line}`);
    }
  } else {
    lines.push(`  ${command.name}`);
  }

  return lines.join("\n");
}

export const helpCommand: Command = {
  name: "help",
  category: "System",
  description: "Show available commands or usage for one command",
  examples: ["help", "help book", "help progress", "help dashboard"],
  complete(prefix: string): string[] {
    const lower = prefix.toLowerCase();
    return allCommandSpecs()
      .map((command) => command.name)
      .filter((name) => name.startsWith(lower));
  },
  execute(args: string): string {
    const target = args.trim().toLowerCase();

    if (!target) {
      return HELP_OVERVIEW;
    }

    const command = resolveCommandSpec(target);
    if (!command) {
      return `Unknown command: ${target}. Type "help" for available commands.`;
    }

    return formatCommandHelp(command);
  },
};
