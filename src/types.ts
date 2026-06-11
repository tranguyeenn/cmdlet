/**
 * Shared types for the cmdlet command system.
 */

/** Command group shown in help output. */
export type CommandCategory =
  | "System"
  | "Academic"
  | "Productivity"
  | "Reading"
  | "Overview"
  | "Navigation"
  | "Media"
  | "Utilities";

/** Result from a command — plain text or text plus an interactive follow-up step. */
export type CommandResult =
  | string
  | {
      output: string;
      followUp?: (input: string) => Promise<CommandResult>;
      hint?: string;
    };

/** A single palette command with metadata and execution handler. */
export interface Command {
  name: string;
  category: CommandCategory;
  description: string;
  execute(args: string): Promise<CommandResult> | CommandResult;
  /** Example invocations shown by `help <command>`. */
  examples?: string[];
  /** Optional subcommand/tab completions for arguments after the command name. */
  complete?(prefix: string): string[];
}

/** One line in the on-screen command history. */
export interface HistoryEntry {
  input: string;
  output: string;
}

/** Parsed user input split into command name and arguments. */
export interface ParsedInput {
  commandName: string;
  args: string;
}
