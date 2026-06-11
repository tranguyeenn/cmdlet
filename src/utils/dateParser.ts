const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

export interface ParsedDuration {
  minutes: number;
  rest: string;
}

export interface ParsedTime {
  hours: number;
  minutes: number;
  rest: string;
}

export interface ParsedDate {
  date: Date;
  label: string;
  rest: string;
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function atLocalTime(base: Date, hours: number, minutes: number): Date {
  const next = new Date(base);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

/** Next calendar occurrence of a weekday (0 = Sunday). Skips today. */
export function nextWeekday(targetDay: number, from = new Date()): Date {
  const result = new Date(from);
  result.setHours(0, 0, 0, 0);
  const delta = (targetDay - result.getDay() + 7) % 7;
  result.setDate(result.getDate() + (delta === 0 ? 7 : delta));
  return result;
}

const DURATION_UNIT =
  /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/gi;

function parseDurationMinutes(text: string): number | null {
  const working = text.trim().toLowerCase();
  if (!working) {
    return null;
  }

  const compact = working.match(
    /^(\d+(?:\.\d+)?)(h|hr|hrs|hour|hours)(\d+(?:\.\d+)?)(m|min|mins|minute|minutes)?$/,
  );
  if (compact) {
    const hours = Number.parseFloat(compact[1]);
    const minutes = Number.parseFloat(compact[3]);
    return Math.max(Math.round(hours * 60 + minutes), 1);
  }

  let total = 0;
  let lastIndex = 0;
  let matched = false;

  for (const match of working.matchAll(DURATION_UNIT)) {
    if (match.index !== undefined && match.index > lastIndex) {
      const gap = working.slice(lastIndex, match.index);
      if (gap.trim()) {
        return null;
      }
    }

    matched = true;
    const amount = Number.parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    total += unit.startsWith("h") ? Math.round(amount * 60) : Math.round(amount);
    lastIndex = match.index + match[0].length;
  }

  if (!matched || working.slice(lastIndex).trim()) {
    return null;
  }

  return Math.max(total, 1);
}

/** Extract a duration such as 1h, 30m, or 1h40m. */
export function extractDuration(input: string): ParsedDuration | null {
  const trimmed = input.trim();
  const standalone = parseDurationMinutes(trimmed);
  if (standalone !== null) {
    return {
      minutes: standalone,
      rest: "",
    };
  }

  const trailingPattern =
    /(\d+(?:\.\d+)?(?:h|hr|hrs|hour|hours)\d+(?:\.\d+)?(?:m|min|mins|minute|minutes)?|\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)(?:\s+\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes))*)\s*$/i;
  const match = input.match(trailingPattern);
  if (!match) {
    return null;
  }

  const minutes = parseDurationMinutes(match[1]);
  if (minutes === null) {
    return null;
  }

  return {
    minutes,
    rest: normalizeSpaces(input.slice(0, match.index)),
  };
}

/** Extract a clock time in 24h format (10, 10:00, 14:30). */
export function extractTime(input: string): ParsedTime | null {
  const trimmed = input.trim();

  const standaloneHour = trimmed.match(/^([01]?\d|2[0-3])$/);
  if (standaloneHour) {
    return {
      hours: Number.parseInt(standaloneHour[1], 10),
      minutes: 0,
      rest: "",
    };
  }

  const clockMatch = input.match(/(?:^|\s)((?:[01]?\d|2[0-3]):[0-5]\d)\b/);
  if (clockMatch) {
    const [hours, minutes] = clockMatch[1].split(":").map((part) =>
      Number.parseInt(part, 10),
    );
    return {
      hours,
      minutes,
      rest: normalizeSpaces(input.replace(clockMatch[0], " ")),
    };
  }

  if (!looksLikeMonthDay(input)) {
    const hourMatch = input.match(/(?:^|\s)([01]?\d|2[0-3])\s*$/);
    if (hourMatch) {
      return {
        hours: Number.parseInt(hourMatch[1], 10),
        minutes: 0,
        rest: normalizeSpaces(input.slice(0, hourMatch.index)),
      };
    }
  }

  return null;
}

function looksLikeMonthDay(input: string): boolean {
  return /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}\b/i.test(
    input,
  );
}

/** Extract a simple date token such as tomorrow, Friday, or June 12. */
export function extractDate(input: string, now = new Date()): ParsedDate | null {
  const monthDayPattern =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
  const monthDayMatch = input.match(monthDayPattern);
  if (monthDayMatch) {
    const month = MONTHS[monthDayMatch[1].toLowerCase()];
    const day = Number.parseInt(monthDayMatch[2], 10);
    let year = now.getFullYear();
    let candidate = new Date(year, month, day);
    if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      candidate = new Date(year + 1, month, day);
    }

    return {
      date: candidate,
      label: `${monthDayMatch[1]} ${day}`,
      rest: normalizeSpaces(input.replace(monthDayMatch[0], " ")),
    };
  }

  const rules: Array<{ pattern: RegExp; build: () => { date: Date; label: string } }> = [
    {
      pattern: /\btomorrow\b/i,
      build: () => {
        const date = new Date(now);
        date.setDate(date.getDate() + 1);
        date.setHours(0, 0, 0, 0);
        return { date, label: "tomorrow" };
      },
    },
    {
      pattern: /\btoday\b/i,
      build: () => {
        const date = new Date(now);
        date.setHours(0, 0, 0, 0);
        return { date, label: "today" };
      },
    },
  ];

  for (const rule of rules) {
    const match = input.match(rule.pattern);
    if (match) {
      const built = rule.build();
      return {
        date: built.date,
        label: built.label,
        rest: normalizeSpaces(input.replace(match[0], " ")),
      };
    }
  }

  const weekdayPattern =
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i;
  const weekdayMatch = input.match(weekdayPattern);
  if (weekdayMatch) {
    const dayIndex = WEEKDAY_INDEX[weekdayMatch[1].toLowerCase()];
    const date = nextWeekday(dayIndex, now);
    const label = weekdayMatch[1][0].toUpperCase() + weekdayMatch[1].slice(1).toLowerCase();
    return {
      date,
      label,
      rest: normalizeSpaces(input.replace(weekdayMatch[0], " ")),
    };
  }

  return null;
}

/** Build all-day start/end datetimes and a human-readable label. */
export function buildAllDayEventTimes(
  date: Date,
  dateLabel: string,
): { startAt: Date; endAt: Date; timeLabel: string } {
  const startAt = atLocalTime(date, 0, 0);
  const endAt = new Date(startAt);
  endAt.setDate(endAt.getDate() + 1);
  return {
    startAt,
    endAt,
    timeLabel: `${dateLabel} (all day)`,
  };
}

/** Build start/end datetimes and a human-readable label. */
export function buildEventTimes(
  date: Date,
  dateLabel: string,
  hours: number,
  minutes: number,
  durationMinutes: number,
): { startAt: Date; endAt: Date; timeLabel: string } {
  const startAt = atLocalTime(date, hours, minutes);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  const timeLabel = `${dateLabel} ${formatClock(startAt)} - ${formatClock(endAt)}`;
  return { startAt, endAt, timeLabel };
}

export function formatClock(value: Date): string {
  const hours = value.getHours().toString().padStart(2, "0");
  const minutes = value.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
