/** Parse "Title With Spaces 864" into title and trailing number. */
export function parseTitleAndNumber(args: string): { title: string; number: number } | null {
  const trimmed = args.trim();
  const match = trimmed.match(/^(.+?)\s+(\d+)$/);
  if (!match) {
    return null;
  }

  const number = Number.parseInt(match[2], 10);
  const title = match[1].trim();
  if (!title || Number.isNaN(number)) {
    return null;
  }

  return { title, number };
}

/** Parse "Title With Spaces 120" or "Title With Spaces +50". */
export function parseTitleAndProgress(args: string): { title: string; value: string } | null {
  const trimmed = args.trim();
  const incrementMatch = trimmed.match(/^(.+?)\s+(\+\d+)$/);
  if (incrementMatch) {
    return { title: incrementMatch[1].trim(), value: incrementMatch[2] };
  }

  const pageMatch = trimmed.match(/^(.+?)\s+(\d+)$/);
  if (pageMatch) {
    return { title: pageMatch[1].trim(), value: pageMatch[2] };
  }

  return null;
}

/** Parse subcommand and remaining args. */
export function parseSubcommand(args: string): { action: string; rest: string } {
  const trimmed = args.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return { action: trimmed.toLowerCase(), rest: "" };
  }

  return {
    action: trimmed.slice(0, spaceIndex).toLowerCase(),
    rest: trimmed.slice(spaceIndex + 1).trim(),
  };
}
