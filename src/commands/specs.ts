import type { CommandCategory } from "../types";

export interface CommandSpec {
  name: string;
  category: CommandCategory;
  description: string;
  examples: string[];
  completions?: readonly string[];
}

export const commandSpecs: CommandSpec[] = [
  {
    name: "open",
    category: "System",
    description: "Launch a macOS application (e.g. open Spotify)",
    examples: ["open Spotify", "open Safari", "open Terminal"],
  },
  {
    name: "calc",
    category: "System",
    description: "Evaluate a math expression (e.g. calc 5*8)",
    examples: ["calc 5*8", "calc (10 + 3) / 2", "calc 100 - 25 * 2"],
  },
  {
    name: "clear",
    category: "System",
    description: "Clear the command output history",
    examples: ["clear"],
  },
  {
    name: "brain",
    category: "Overview",
    description: "Manage the Excel second brain workbook",
    examples: ["brain init", "brain open", "brain status", "brain sync"],
    completions: ["init", "open", "path", "status", "sync"],
  },
  {
    name: "class",
    category: "Academic",
    description: "Add, list, or delete classes",
    examples: ["class add", "class edit Calculus II", "class delete Calculus II", "class list"],
    completions: ["add", "edit", "delete", "list"],
  },
  {
    name: "assignment",
    category: "Academic",
    description: "Add, edit, list, or delete assignments",
    examples: [
      "assignment add",
      "assignment add CS101 | Problem Set 3",
      "assignment edit Problem Set 3",
      "assignment delete Problem Set 3",
      "assignment list",
    ],
    completions: ["add", "edit", "delete", "list"],
  },
  {
    name: "exam",
    category: "Academic",
    description: "Add, edit, list, or delete exams",
    examples: ["exam add", "exam add CS101 | Midterm", "exam edit Midterm", "exam delete Midterm", "exam list"],
    completions: ["add", "edit", "delete", "list"],
  },
  {
    name: "note",
    category: "Productivity",
    description: "Create notes in Apple Notes (Cmdlet Notes folder)",
    examples: ["note add", "note list", "note edit meeting notes"],
    completions: ["list", "add", "edit"],
  },
  {
    name: "task",
    category: "Productivity",
    description: "Create tasks in Apple Reminders with category and due date",
    examples: ["task add", "task add Finish DSA homework | School", "task list", "task edit Finish DSA homework"],
    completions: ["list", "delete", "add", "edit"],
  },
  {
    name: "reminder",
    category: "Productivity",
    description: "Create reminders in Apple Reminders (syncs to iPhone)",
    examples: [
      "reminder list",
      "reminder drink water daily",
      "reminder delete buy groceries",
      "remind me to finish postgres migration tomorrow at 8pm",
      "reminder buy groceries Friday 17:00",
    ],
    completions: ["list", "delete", "tomorrow", "Friday"],
  },
  {
    name: "alert",
    category: "Productivity",
    description: "Sync native Apple Reminders for due dates and daily logs",
    examples: ["alert sync", "reminder drink water daily", "settings dueRemindersEnabled true"],
    completions: ["sync"],
  },
  {
    name: "notify",
    category: "Utilities",
    description: "Send a test notification to check notifications are working",
    examples: ["notify", "notify hello from cmdlet"],
    completions: ["test"],
  },
  {
    name: "event",
    category: "Productivity",
    description: "Create local events (saved in Cmdlet, no Apple Calendar sync)",
    examples: ["event add", "event add Study Session", "event list", "event edit Study Session"],
    completions: ["list", "delete", "add", "edit"],
  },
  {
    name: "project",
    category: "Productivity",
    description: "Add, edit, or delete projects in the second brain workbook",
    examples: ["project add", "project edit Cmdlet", "project delete Cmdlet", "project list"],
    completions: ["add", "edit", "delete", "list"],
  },
  {
    name: "life",
    category: "Productivity",
    description: "Log or edit daily life stats in the second brain workbook",
    examples: ["life log", "life edit today"],
    completions: ["log", "edit"],
  },
  {
    name: "book",
    category: "Reading",
    description: "Add, edit, list, delete, or set your current book",
    examples: ["book add", "book edit Deep Work", "book delete Deep Work", "book list"],
    completions: ["add", "edit", "delete", "list", "current"],
  },
  {
    name: "progress",
    category: "Reading",
    description: "Set or increment reading progress for a book",
    examples: ["progress Anna Karenina 120", "progress Anna Karenina +50"],
  },
  {
    name: "dashboard",
    category: "Overview",
    description: "Show current books and planner summary",
    examples: ["dashboard"],
  },
  {
    name: "export",
    category: "Overview",
    description: "Export planner data to planner-export.json",
    examples: ["export"],
  },
  {
    name: "web",
    category: "Navigation",
    description: "Search the web in Firefox",
    examples: ["web rust ownership", "web weather today"],
  },
  {
    name: "file",
    category: "Navigation",
    description: "Search files and open by number",
    examples: ["file report.pdf", "file budget.xlsx"],
  },
  {
    name: "spotify",
    category: "Media",
    description: "Spotify: now, pause, play, next, prev, or play a song",
    examples: ["spotify now", "spotify pause", "spotify play", "spotify play bohemian rhapsody", "spotify next"],
    completions: ["now", "pause", "play", "next", "prev"],
  },
  {
    name: "timer",
    category: "Utilities",
    description: "Start a timer (e.g. timer 5m, timer 30s, timer 1h)",
    examples: ["timer 30s", "timer 5m", "timer 1h"],
    completions: ["30s", "5m", "10m", "1h"],
  },
  {
    name: "clipboard",
    category: "Utilities",
    description: "Read clipboard, or copy text with: clipboard <text>",
    examples: ["clipboard", "clipboard hello world"],
  },
  {
    name: "settings",
    category: "Utilities",
    description: "View or change app settings",
    examples: ["settings", "settings integrations", "settings dueRemindersEnabled true"],
    completions: [
      "browser",
      "calendarEnabled",
      "remindersEnabled",
      "notesEnabled",
      "dueRemindersEnabled",
      "dueReminderDaysBefore",
      "dueReminderHour",
      "cmdletReminderList",
      "waterReminderEnabled",
      "integrations",
    ],
  },
  {
    name: "help",
    category: "System",
    description: "Show available commands or usage for one command",
    examples: ["help", "help book", "help progress", "help dashboard"],
  },
];

export const commandAliases = new Map<string, string>([
  ["sp", "spotify"],
  ["search", "web"],
  ["remind", "reminder"],
]);

export function allCommandSpecs(): CommandSpec[] {
  return commandSpecs;
}

export function resolveCommandSpec(name: string): CommandSpec | undefined {
  const lower = name.toLowerCase();
  const canonical = commandAliases.get(lower) ?? lower;
  return commandSpecs.find((command) => command.name === canonical);
}
