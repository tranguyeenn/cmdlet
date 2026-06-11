/**
 * Create local events (no Apple Calendar sync).
 */
import type { Command, CommandResult } from "../types";
import {
  deleteEvent,
  getEventHistory,
} from "../storage/calendarStore";
import { submitEventRow, updateEventRow } from "../services/sheetFormSubmit";
import { syncEventDelete, withExcelWarning } from "../services/excelSync";
import { examplesBlock } from "../utils/hubExecute";
import { completeSheetRowPrompt } from "../utils/excelRowPrompt";
import { completeSheetRowEditPrompt } from "../utils/sheetEditPrompt";
import { parseSubcommand } from "../utils/parseArgs";
import {
  expandUpcomingEvents,
  formatEventSchedule,
} from "../utils/upcomingSchedule";

const EXAMPLES = [
  "event add",
  "event add Study Session",
  "event list",
  "event edit Study Session",
];

async function listRecentEvents(): Promise<CommandResult> {
  try {
    const history = await getEventHistory();
    const entries = expandUpcomingEvents(history);
    if (entries.length === 0 && history.length > 0) {
      return [
        "Recent events (local):",
        ...history.map((entry) => {
          const start = new Date(entry.startAt);
          const end = new Date(entry.endAt);
          const date = start.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            weekday: "short",
          });
          const time = `${start.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}-${end.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}`;
          return `${date}  ${time}  ${entry.title}`;
        }),
      ].join("\n");
    }

    return formatEventSchedule(entries);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to load event history: ${message}`;
  }
}

export const eventCommand: Command = {
  name: "event",
  category: "Productivity",
  description: "Create local events (saved in Cmdlet, no Apple Calendar sync)",
  examples: EXAMPLES,
  complete(prefix: string): string[] {
    const samples = ["list", "delete", "add", "edit"];
    const lower = prefix.toLowerCase();
    return samples.filter((sample) => sample.startsWith(lower));
  },
  async execute(args: string): Promise<CommandResult> {
    const trimmed = args.trim();
    const { action } = parseSubcommand(trimmed);

    if (action === "list") {
      return listRecentEvents();
    }

    if (action === "delete" || action === "remove") {
      const title = parseSubcommand(trimmed).rest.trim();
      if (!title) {
        return "Usage: event delete <title>";
      }

      try {
        const response = await deleteEvent({ title });
        const excelError = await syncEventDelete(title);
        return withExcelWarning(response.message, excelError);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Failed to delete event: ${message}`;
      }
    }

    if (action === "edit") {
      const title = parseSubcommand(trimmed).rest.trim();
      if (!title) {
        return "Usage: event edit <title>";
      }
      return completeSheetRowEditPrompt("events", title, updateEventRow);
    }

    if (!trimmed) {
      return examplesBlock(EXAMPLES);
    }

    if (action === "add") {
      return completeSheetRowPrompt("events", parseSubcommand(trimmed).rest, submitEventRow);
    }

    return completeSheetRowPrompt("events", trimmed, submitEventRow);
  },
};
