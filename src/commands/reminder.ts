/**
 * Create reminders in Apple Reminders from the terminal.
 */
import type { Command, CommandResult } from "../types";
import {
  createReminder,
  DEFAULT_REMINDER_LIST,
  deleteReminder,
  getReminderHistory,
} from "../storage/reminderStore";
import { syncTask, syncTaskDelete, withExcelWarning } from "../services/excelSync";
import { loadSettings } from "../storage/settingsStore";
import { buildDueAt, examplesBlock, parseReminderInput } from "../utils/hubExecute";
import { parseSubcommand } from "../utils/parseArgs";

const EXAMPLES = [
  "reminder list",
  "reminder drink water daily",
  "reminder delete buy groceries",
  "remind me to finish postgres migration tomorrow at 8pm",
  "reminder buy groceries Friday 17:00",
];

function parseRepeatRule(text: string): {
  title: string;
  repeatRule: "none" | "daily" | "weekly" | "monthly";
} {
  const lower = text.toLowerCase();
  const rules: Array<{ pattern: RegExp; rule: "daily" | "weekly" | "monthly" }> = [
    { pattern: /\bdaily\b/, rule: "daily" },
    { pattern: /\bevery day\b/, rule: "daily" },
    { pattern: /\bweekly\b/, rule: "weekly" },
    { pattern: /\bevery week\b/, rule: "weekly" },
    { pattern: /\bmonthly\b/, rule: "monthly" },
    { pattern: /\bevery month\b/, rule: "monthly" },
  ];

  for (const entry of rules) {
    if (entry.pattern.test(lower)) {
      const title = text.replace(entry.pattern, "").replace(/\s+/g, " ").trim();
      return { title, repeatRule: entry.rule };
    }
  }

  return { title: text.trim(), repeatRule: "none" };
}

async function listRecentReminders(): Promise<CommandResult> {
  try {
    const history = await getReminderHistory();
    if (history.length === 0) {
      return "No recent reminders.";
    }

    return history
      .map((entry) => {
        const due = entry.dueAt
          ? new Date(entry.dueAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
          : "no due date";
        return `${due}  ${entry.title}  [${entry.listName}]`;
      })
      .join("\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to load reminder history: ${message}`;
  }
}

export const reminderCommand: Command = {
  name: "reminder",
  category: "Productivity",
  description: "Create reminders in Apple Reminders (syncs to iPhone)",
  examples: EXAMPLES,
  complete(prefix: string): string[] {
    const samples = ["list", "delete", "tomorrow", "Friday"];
    const lower = prefix.toLowerCase();
    return samples.filter((sample) => sample.startsWith(lower));
  },
  async execute(args: string): Promise<CommandResult> {
    const trimmed = args.trim();
    const { action } = parseSubcommand(trimmed);

    if (action === "list") {
      return listRecentReminders();
    }

    if (action === "delete" || action === "remove") {
      const title = parseSubcommand(trimmed).rest.trim();
      if (!title) {
        return "Usage: reminder delete <title>";
      }

      try {
        const settings = await loadSettings();
        if (!settings.remindersEnabled) {
          return "Reminders integration is disabled. Run: settings remindersEnabled true";
        }

        const response = await deleteReminder({ title });
        const excelError = await syncTaskDelete(title);
        return withExcelWarning(response.message, excelError);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Failed to delete reminder: ${message}`;
      }
    }

    if (!trimmed) {
      return examplesBlock(EXAMPLES);
    }

    const parsed = parseReminderInput(trimmed);
    if (!parsed) {
      return "Could not parse reminder. Include a title.";
    }

    const repeatParsed = parseRepeatRule(parsed.title);
    const title = repeatParsed.title || parsed.title;

    try {
      const settings = await loadSettings();
      if (!settings.remindersEnabled) {
        return "Reminders integration is disabled. Run: settings remindersEnabled true";
      }

      const listName = settings.cmdletReminderList || DEFAULT_REMINDER_LIST;
      const response = await createReminder({
        title,
        dueAt: buildDueAt(parsed.dueDate, parsed.dueTime),
        listName,
        repeatRule: repeatParsed.repeatRule,
      });

      const excelError = await syncTask({
        title,
        category: listName,
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
      });
      return withExcelWarning(`${response.message}: ${title}`, excelError);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Failed to create reminder: ${message}`;
    }
  },
};
