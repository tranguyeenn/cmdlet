/**
 * Second brain workbook commands (Excel-backed life dashboard).
 */
import type { Command, CommandResult } from "../types";
import {
  getWorkbookStatus,
  initSecondBrain,
  openSecondBrain,
  syncPlannerToExcel,
} from "../services/secondBrain";
import {
  submitLifeRow,
  submitProjectRow,
  updateLifeRow,
  updateProjectRow,
} from "../services/sheetFormSubmit";
import { completeSheetRowPrompt } from "../utils/excelRowPrompt";
import { completeSheetRowEditPrompt } from "../utils/sheetEditPrompt";
import { getWorkbookPath } from "../services/excel";
import { syncDueRemindersQuiet } from "../services/dueReminders";
import { syncProjectDelete, withExcelWarning } from "../services/excelSync";
import { parseSubcommand } from "../utils/parseArgs";
import { listActiveSheetFormRows } from "../utils/activeSheetRows";

const BRAIN_EXAMPLES = [
  "brain init",
  "brain open",
  "brain status",
  "brain sync",
  "assignment add CS101 | Problem Set 3 | 2026-06-15 | High",
  "exam add CS101 | Midterm | 2026-06-20 | 25",
  "project add Cmdlet | Dev | Building | 2026-07-01",
  "book add Deep Work | Cal Newport | 304",
  "life log 7.5 | Good | High | 4 | 2 | 50",
];

function field(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.toLowerCase() !== "n/a" ? trimmed : "";
}

async function runBrainAction(action: string, _rest: string): Promise<string> {
  const normalized = action.toLowerCase();

  if (normalized === "init") {
    return initSecondBrain();
  }

  if (normalized === "open") {
    return openSecondBrain();
  }

  if (normalized === "path") {
    const path = await getWorkbookPath();
    return path;
  }

  if (normalized === "status") {
    return getWorkbookStatus();
  }

  if (normalized === "sync") {
    return syncPlannerToExcel();
  }

  return [
    "Second brain commands:",
    "  brain init    Create or update the Excel workbook",
    "  brain open    Open the workbook (close Excel before saving from Cmdlet)",
    "  brain status  Compare Excel row counts with planner",
    "  brain sync    Copy planner items missing from Excel",
    "  brain path    Show workbook file path",
    "",
    "Log data with pipe-separated fields:",
    ...BRAIN_EXAMPLES.slice(2).map((line) => `  ${line}`),
  ].join("\n");
}

export const brainCommand: Command = {
  name: "brain",
  category: "Overview",
  description: "Manage the Excel second brain workbook",
  examples: ["brain init", "brain open", "brain status", "brain sync"],
  complete(prefix: string): string[] {
    const lower = prefix.toLowerCase();
    return ["init", "open", "path", "status", "sync"].filter((item) => item.startsWith(lower));
  },
  async execute(args: string): Promise<CommandResult> {
    const trimmed = args.trim();
    const { action, rest } = parseSubcommand(trimmed);

    try {
      return await runBrainAction(action || "", rest);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Brain error: ${message}`;
    }
  },
};

export const projectCommand: Command = {
  name: "project",
  category: "Productivity",
  description: "Add, edit, or delete projects in the second brain workbook",
  examples: ["project add", "project edit Cmdlet", "project delete Cmdlet", "project list"],
  complete(prefix: string): string[] {
    const lower = prefix.toLowerCase();
    return ["add", "edit", "delete", "list"].filter((item) => item.startsWith(lower));
  },
  async execute(args: string): Promise<CommandResult> {
    const { action, rest } = parseSubcommand(args.trim());

    if (action === "delete" || action === "remove") {
      if (!rest) {
        return "Usage: project delete <name>";
      }
      try {
        const excelError = await syncProjectDelete(rest);
        if (excelError) {
          return withExcelWarning(`Deleted project: ${rest}`, excelError);
        }
        await syncDueRemindersQuiet();
        return `Deleted project: ${rest} (removed from Excel)`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Project error: ${message}`;
      }
    }

    if (action === "edit") {
      if (!rest) {
        return "Usage: project edit <name>";
      }
      return completeSheetRowEditPrompt("projects", rest, updateProjectRow);
    }

    if (action === "list") {
      try {
        const rows = await listActiveSheetFormRows("projects");
        if (rows.length === 0) {
          return "No active projects.";
        }

        return rows
          .map(({ values }) => {
            const category = field(values.category);
            const status = field(values.status);
            const deadline = field(values.deadline);
            const details = [
              category && `[${category}]`,
              status,
              deadline && `due ${deadline}`,
            ].filter(Boolean).join("  ");
            return details ? `${values.project}  ${details}` : values.project;
          })
          .join("\n");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Project error: ${message}`;
      }
    }

    if (action !== "add") {
      return "Usage: project add | project edit <name> | project delete <name> | project list";
    }

    try {
      return completeSheetRowPrompt("projects", rest, submitProjectRow);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Project error: ${message}`;
    }
  },
};

export const lifeCommand: Command = {
  name: "life",
  category: "Productivity",
  description: "Log or edit daily life stats in the second brain workbook",
  examples: ["life log", "life edit today"],
  complete(prefix: string): string[] {
    const lower = prefix.toLowerCase();
    return ["log", "edit"].filter((item) => item.startsWith(lower));
  },
  async execute(args: string): Promise<CommandResult> {
    const { action, rest } = parseSubcommand(args.trim());

    if (action === "edit") {
      return completeSheetRowEditPrompt("life", rest || "today", updateLifeRow);
    }

    if (action !== "log") {
      return "Usage: life log | life edit [today]";
    }

    try {
      return completeSheetRowPrompt("life", rest, submitLifeRow);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Life log error: ${message}`;
    }
  },
};
