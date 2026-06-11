import type { EventHistoryEntry } from "../types/event";
import type { TaskEntry } from "../types/task";
import { formatClock } from "./dateParser";

const HORIZON_DAYS = 60;
const MAX_OCCURRENCES_PER_EVENT = 30;

export interface ScheduleEntry {
  at: Date;
  endAt: Date;
  title: string;
  allDay: boolean;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function atLocalTime(base: Date, hours: number, minutes: number): Date {
  const next = new Date(base);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function includeOccurrence(at: Date, endAt: Date, now: Date): boolean {
  return endAt > now && at >= now;
}

function matchesRepeatRule(date: Date, repeatRule: string, anchor: Date): boolean {
  switch (repeatRule) {
    case "daily":
      return true;
    case "weekly":
      return date.getDay() === anchor.getDay();
    case "monthly":
      return date.getDate() === anchor.getDate();
    default:
      return false;
  }
}

function expandRecurringEvent(
  event: EventHistoryEntry,
  now: Date,
  horizonEnd: Date,
): ScheduleEntry[] {
  const eventStart = new Date(event.startAt);
  const eventEnd = new Date(event.endAt);
  const durationMs = eventEnd.getTime() - eventStart.getTime();
  const hours = eventStart.getHours();
  const minutes = eventStart.getMinutes();
  const entries: ScheduleEntry[] = [];

  let cursor = startOfDay(now);
  if (cursor < startOfDay(eventStart)) {
    cursor = startOfDay(eventStart);
  }

  while (cursor <= horizonEnd && entries.length < MAX_OCCURRENCES_PER_EVENT) {
    if (
      cursor >= startOfDay(eventStart) &&
      matchesRepeatRule(cursor, event.repeatRule, eventStart)
    ) {
      const at = atLocalTime(cursor, hours, minutes);
      const endAt = new Date(at.getTime() + durationMs);

      if (includeOccurrence(at, endAt, now)) {
        entries.push({
          at,
          endAt,
          title: event.title,
          allDay: false,
        });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return entries;
}

/** Expand local event history into upcoming dated occurrences. */
export function expandUpcomingEvents(
  events: EventHistoryEntry[],
  now = new Date(),
): ScheduleEntry[] {
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + HORIZON_DAYS);
  const entries: ScheduleEntry[] = [];

  for (const event of events) {
    const eventStart = new Date(event.startAt);
    const eventEnd = new Date(event.endAt);

    if (!event.repeatRule || event.repeatRule === "none") {
      if (includeOccurrence(eventStart, eventEnd, now)) {
        entries.push({
          at: eventStart,
          endAt: eventEnd,
          title: event.title,
          allDay: false,
        });
      }
      continue;
    }

    entries.push(...expandRecurringEvent(event, now, horizonEnd));
  }

  return entries.sort((left, right) => left.at.getTime() - right.at.getTime());
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

export function formatEventSchedule(entries: ScheduleEntry[]): string {
  if (entries.length === 0) {
    return "No upcoming events.";
  }

  return entries
    .map((entry) => {
      const date = formatDateLabel(entry.at);
      const time = `${formatClock(entry.at)}-${formatClock(entry.endAt)}`;
      return `${date}  ${time}  ${entry.title}`;
    })
    .join("\n");
}

export function sortUpcomingTasks(tasks: TaskEntry[]): TaskEntry[] {
  return [...tasks].sort((left, right) => {
    if (left.dueAt && right.dueAt) {
      return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
    }
    if (left.dueAt) {
      return -1;
    }
    if (right.dueAt) {
      return 1;
    }
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
}

export function upcomingTasks(tasks: TaskEntry[], now = new Date()): TaskEntry[] {
  return sortUpcomingTasks(tasks).filter((task) => {
    if (!task.dueAt) {
      return true;
    }
    return new Date(task.dueAt) >= now;
  });
}

export function formatTaskSchedule(tasks: TaskEntry[], now = new Date()): string {
  const upcoming = upcomingTasks(tasks, now);
  if (upcoming.length === 0) {
    return "No upcoming tasks.";
  }

  return upcoming
    .map((task) => {
      if (!task.dueAt) {
        return `no due date  ${task.title}`;
      }

      const due = new Date(task.dueAt);
      const date = formatDateLabel(due);
      const time = formatClock(due);
      return `${date}  ${time}  ${task.title}`;
    })
    .join("\n");
}
