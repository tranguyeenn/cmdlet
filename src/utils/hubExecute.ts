import type { ParsedEventInput, ParsedHubInput, ParsedReminderInput } from "./hubParser";
import { parseHubInput } from "./hubParser";

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function timezoneOffsetLabel(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  return `${sign}${pad(hours)}:${pad(minutes)}`;
}

function todayLabel(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseFormDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseFormTime(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return { hours, minutes };
}

export function buildIso(date: Date, hours: number, minutes: number): string {
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}:00${timezoneOffsetLabel(next)}`;
}

export function buildDueAt(dueDate?: string, dueTime?: string): string | undefined {
  if (!dueDate) {
    return undefined;
  }

  const date = parseFormDate(dueDate);
  if (!date) {
    throw new Error("Invalid due date.");
  }

  // For date-only reminders prefer noon to avoid day-rollover across timezones.
  const time = dueTime ? parseFormTime(dueTime) : { hours: 12, minutes: 0 };
  if (!time) {
    throw new Error("Invalid due time. Use HH:MM.");
  }

  return buildIso(date, time.hours, time.minutes);
}

export function buildEventTimes(parsed: ParsedEventInput): {
  startAt: string;
  endAt: string;
} {
  const dateValue = parsed.date ?? todayLabel();
  const date = parseFormDate(dateValue);
  if (!date) {
    throw new Error("Invalid event date.");
  }

  const startTime = parsed.startTime ?? "09:00";
  const start = parseFormTime(startTime);
  if (!start) {
    throw new Error("Invalid start time. Use HH:MM or 2pm.");
  }

  let end = parsed.endTime ? parseFormTime(parsed.endTime) : null;
  if (!end) {
    end = {
      hours: start.hours + 1,
      minutes: start.minutes,
    };
  }
  if (!end) {
    throw new Error("Invalid end time.");
  }

  const startAt = buildIso(date, start.hours, start.minutes);
  const endAt = buildIso(date, end.hours, end.minutes);
  if (new Date(endAt) <= new Date(startAt)) {
    throw new Error("End time must be after start time.");
  }

  return { startAt, endAt };
}

export function parseReminderInput(input: string): ParsedReminderInput | null {
  const parsed = input.toLowerCase().startsWith("remind")
    ? parseHubInput(input)
    : parseHubInput(`remind me to ${input}`);
  return parsed?.intent === "reminder" ? parsed : null;
}

export function parseEventInput(input: string): ParsedEventInput | null {
  const parsed = parseHubInput(input.startsWith("event") ? input : `event ${input}`);
  return parsed?.intent === "event" ? parsed : null;
}

export function parseNoteInput(input: string): Extract<ParsedHubInput, { intent: "note" }> | null {
  const parsed = parseHubInput(input.startsWith("note") ? input : `note ${input}`);
  return parsed?.intent === "note" ? parsed : null;
}

export function examplesBlock(lines: string[]): string {
  return ["Examples:", ...lines.map((line) => `  ${line}`)].join("\n");
}
