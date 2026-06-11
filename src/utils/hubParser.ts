import { extractDate, extractTime } from "./dateParser";

export type HubIntent = "reminder" | "event" | "note";

export interface ParsedReminderInput {
  intent: "reminder";
  title: string;
  dueDate?: string;
  dueTime?: string;
}

export interface ParsedEventInput {
  intent: "event";
  title: string;
  date?: string;
  startTime?: string;
  endTime?: string;
}

export interface ParsedNoteInput {
  intent: "note";
  title: string;
  content: string;
}

export type ParsedHubInput =
  | ParsedReminderInput
  | ParsedEventInput
  | ParsedNoteInput;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatDateLabel(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTimeLabel(hours: number, minutes: number): string {
  return `${pad(hours)}:${pad(minutes)}`;
}

function stripPrefix(input: string, prefixes: string[]): string {
  let working = input.trim();
  for (const prefix of prefixes) {
    const pattern = new RegExp(`^${prefix}\\s+`, "i");
    working = working.replace(pattern, "").trim();
  }
  return working;
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

function extractMeridiemTime(input: string): {
  hours: number;
  minutes: number;
  rest: string;
} | null {
  const match = input.match(
    /(?:^|\s)(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
  );
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const converted = to24Hour(hours, minutes, match[3]);
  return {
    ...converted,
    rest: input.replace(match[0], " ").replace(/\s+/g, " ").trim(),
  };
}

function parseRangeTime(rest: string): {
  start?: { hours: number; minutes: number };
  end?: { hours: number; minutes: number };
  rest: string;
} {
  const rangeMatch = rest.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
  );
  if (!rangeMatch) {
    return { rest };
  }

  const startHours = Number(rangeMatch[1]);
  const startMinutes = Number(rangeMatch[2] ?? "0");
  const startMeridiem = rangeMatch[3]?.toLowerCase();
  const endHours = Number(rangeMatch[4]);
  const endMinutes = Number(rangeMatch[5] ?? "0");
  const endMeridiem = rangeMatch[6]?.toLowerCase();

  const to24 = (hours: number, minutes: number, meridiem?: string) =>
    to24Hour(hours, minutes, meridiem);

  return {
    start: to24(startHours, startMinutes, startMeridiem),
    end: to24(endHours, endMinutes, endMeridiem ?? startMeridiem),
    rest: rest.replace(rangeMatch[0], " ").replace(/\s+/g, " ").trim(),
  };
}

function parseReminder(input: string): ParsedReminderInput | null {
  const working = stripPrefix(input, [
    "remind me to",
    "reminder",
    "remind me",
    "remind",
  ]);
  if (!working) {
    return null;
  }

  let rest = working;
  const date = extractDate(rest);
  if (date) {
    rest = date.rest;
  }

  const time = extractMeridiemTime(rest) ?? extractTime(rest);
  if (time) {
    rest = time.rest;
  }

  const title = rest.trim();
  if (!title) {
    return null;
  }

  return {
    intent: "reminder",
    title,
    dueDate: date ? formatDateLabel(date.date) : undefined,
    dueTime: time ? formatTimeLabel(time.hours, time.minutes) : undefined,
  };
}

function parseEvent(input: string): ParsedEventInput | null {
  const working = stripPrefix(input, ["event", "new event", "calendar event"]);
  if (!working) {
    return null;
  }

  let rest = working;
  const range = parseRangeTime(rest);
  rest = range.rest;

  const date = extractDate(rest);
  if (date) {
    rest = date.rest;
  }

  let time = extractMeridiemTime(rest) ?? extractTime(rest);
  if (time) {
    rest = time.rest;
  }

  const title = rest.trim();
  if (!title) {
    return null;
  }

  return {
    intent: "event",
    title,
    date: date ? formatDateLabel(date.date) : undefined,
    startTime: range.start
      ? formatTimeLabel(range.start.hours, range.start.minutes)
      : time
        ? formatTimeLabel(time.hours, time.minutes)
        : undefined,
    endTime: range.end
      ? formatTimeLabel(range.end.hours, range.end.minutes)
      : undefined,
  };
}

function parseNote(input: string): ParsedNoteInput | null {
  const working = stripPrefix(input, ["note", "quick note", "new note"]);
  if (!working) {
    return null;
  }

  const words = working.split(/\s+/);
  const title = words.slice(0, 2).join(" ");
  const content = words.slice(2).join(" ") || working;

  return {
    intent: "note",
    title,
    content,
  };
}

/** Parse natural-language hub input into structured form defaults. */
export function parseHubInput(input: string): ParsedHubInput | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("remind")) {
    return parseReminder(trimmed);
  }
  if (lower.startsWith("event")) {
    return parseEvent(trimmed);
  }
  if (lower.startsWith("note")) {
    return parseNote(trimmed);
  }

  return null;
}

export function detectHubIntent(input: string): HubIntent | null {
  return parseHubInput(input)?.intent ?? null;
}
