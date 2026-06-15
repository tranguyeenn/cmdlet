import type { CommandCategory } from "../types";

interface CategorizedCommand {
  category: CommandCategory;
}

const CATEGORY_ORDER: CommandCategory[] = [
  "System",
  "Academic",
  "Productivity",
  "Reading",
  "Overview",
  "Navigation",
  "Media",
  "Utilities",
];

/** Group commands by category in display order. */
export function groupCommandsByCategory(
  commands: CategorizedCommand[],
): { label: CommandCategory; commands: CategorizedCommand[] }[] {
  return CATEGORY_ORDER.map((label) => ({
    label,
    commands: commands.filter((command) => command.category === label),
  })).filter((group) => group.commands.length > 0);
}
