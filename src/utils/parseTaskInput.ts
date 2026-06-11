import { extractDate, extractTime } from "./dateParser";

export interface ParsedTaskInput {
  title: string;
  category: string;
  dueDate: string;
  dueTime?: string;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatDateLabel(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTimeLabel(hours: number, minutes: number): string {
  return `${pad(hours)}:${pad(minutes)}`;
}

function to24Hour(hours: number, minutes: number, meridiem?: string): {
  hours: number;
  minutes: number;
} {
  if (!meridiem) {
    return { hours, minutes };
  }

  const lower = meridiem.toLowerCase();
  if (lower === "pm" && hours < 12) {
    return { hours: hours + 12, minutes };
  }
  if (lower === "am" && hours === 12) {
    return { hours: 0, minutes };
  }
  return { hours, minutes };
}

function parseTimeFromRest(rest: string): { hours: number; minutes: number } | null {
  const trimmed = rest.trim();
  if (!trimmed) {
    return null;
  }

  const meridiemMatch = trimmed.match(/(?:^|\s)(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (meridiemMatch) {
    const hours = Number(meridiemMatch[1]);
    const minutes = Number(meridiemMatch[2] ?? "0");
    return to24Hour(hours, minutes, meridiemMatch[3]);
  }

  return extractTime(trimmed);
}

function parseDuePart(duePart: string): { dueDate: string; dueTime?: string } | null {
  const trimmed = duePart.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(.+))?$/i.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    let dueTime: string | undefined;
    if (isoMatch[4]) {
      const time = parseTimeFromRest(isoMatch[4]);
      if (!time) {
        return null;
      }
      dueTime = formatTimeLabel(time.hours, time.minutes);
    }

    return { dueDate: formatDateLabel(date), dueTime };
  }

  let rest = trimmed;
  const date = extractDate(rest);
  if (!date) {
    return null;
  }
  rest = date.rest;

  const time = parseTimeFromRest(rest);
  return {
    dueDate: formatDateLabel(date.date),
    dueTime: time ? formatTimeLabel(time.hours, time.minutes) : undefined,
  };
}

/** Parse `title | category | due date [time]` task input. */
export function parseTaskInput(input: string): ParsedTaskInput | null {
  const trimmed = input.trim();
  if (!trimmed.includes("|")) {
    return null;
  }

  const parts = trimmed.split("|").map((part) => part.trim());
  if (parts.length < 3) {
    return null;
  }

  const title = parts[0] ?? "";
  const category = parts[1] ?? "";
  const duePart = parts.slice(2).join("|").trim();
  if (!title || !category || !duePart) {
    return null;
  }

  const due = parseDuePart(duePart);
  if (!due) {
    return null;
  }

  return {
    title,
    category,
    dueDate: due.dueDate,
    dueTime: due.dueTime,
  };
}

export const TASK_USAGE =
  "Usage: task <title> | <category> | <due date> [time]\n" +
  "Examples:\n" +
  "  task Finish homework | School | 2026-06-15\n" +
  "  task call dentist | Personal | tomorrow 17:00\n" +
  "  task submit report | Work | Friday";
