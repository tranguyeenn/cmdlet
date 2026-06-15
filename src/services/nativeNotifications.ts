import { loadSettings } from "../storage/settingsStore";
import { listSheetFormRows } from "./secondBrain";
import { timeAsync } from "../lib/perf";
import { timedInvoke } from "../lib/timedInvoke";

const WATER_INTERVAL_MS = 60 * 60 * 1000;
const DUE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const NOTIFIED_KEY = "cmdlet-notified-keys";

function todayKey(): string {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function loadNotifiedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw) as { date: string; keys: string[] };
    if (parsed.date !== todayKey()) {
      return new Set();
    }
    return new Set(parsed.keys);
  } catch {
    return new Set();
  }
}

function saveNotifiedKeys(keys: Set<string>): void {
  localStorage.setItem(
    NOTIFIED_KEY,
    JSON.stringify({ date: todayKey(), keys: [...keys] }),
  );
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

function daysUntil(date: Date): number {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

function isExactDueDay(dateValue: string | undefined): boolean {
  if (!dateValue?.trim()) {
    return false;
  }
  const due = parseFormDate(dateValue);
  if (!due) {
    return false;
  }
  return daysUntil(due) === 0;
}

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

async function showNotification(
  title: string,
  body: string,
  urgent = false,
): Promise<void> {
  try {
    await timedInvoke("notify", { title, body, urgent }, "notifications.show");
  } catch {
    // Notifications should never block the app.
  }
}

async function notifyWaterIfEnabled(): Promise<void> {
  const settings = await loadSettings();
  if (!settings.waterReminderEnabled) {
    return;
  }

  await showNotification("cmdlet", "Time to drink water.");
}

async function notifyDueItemsIfEnabled(): Promise<void> {
  await timeAsync("notifications.dueScan", async () => {
    const settings = await loadSettings();
    if (!settings.dueRemindersEnabled) {
      return;
    }

    const notified = loadNotifiedKeys();
    const day = todayKey();

  const assignments = await listSheetFormRows("assignments");
  for (const row of assignments) {
    if (normalized(row.values.status) === "done") {
      continue;
    }
    if (!isExactDueDay(row.values.dueDate)) {
      continue;
    }

    const key = `assignment:${row.key}:${day}`;
    if (notified.has(key)) {
      continue;
    }

    const dueLabel = row.values.dueDate ?? "";
    const course = row.values.course?.trim() || "n/a";
    await showNotification(
      "Assignment due today",
      `${row.key} (${course}) is due today (${dueLabel}).`,
      true,
    );
    notified.add(key);
  }

  const exams = await listSheetFormRows("exams");
  for (const row of exams) {
    if (normalized(row.values.studyStatus) === "completed") {
      continue;
    }
    if (!isExactDueDay(row.values.examDate)) {
      continue;
    }

    const key = `exam:${row.key}:${day}`;
    if (notified.has(key)) {
      continue;
    }

    const dueLabel = row.values.examDate ?? "";
    const course = row.values.course?.trim() || "n/a";
    await showNotification(
      "Exam due today",
      `${row.key} (${course}) is due today (${dueLabel}).`,
      true,
    );
    notified.add(key);
  }

  const projects = await listSheetFormRows("projects");
  for (const row of projects) {
    if (["released", "archived"].includes(normalized(row.values.status))) {
      continue;
    }
    if (!isExactDueDay(row.values.deadline)) {
      continue;
    }

    const key = `project:${row.key}:${day}`;
    if (notified.has(key)) {
      continue;
    }

    const dueLabel = row.values.deadline ?? "";
    const category = row.values.category?.trim() || "n/a";
    await showNotification(
      "Project due today",
      `${row.key} (${category}) is due today (${dueLabel}).`,
      true,
    );
    notified.add(key);
  }

  const tasks = await listSheetFormRows("tasks");
  for (const row of tasks) {
    if (["done", "finished"].includes(normalized(row.values.status))) {
      continue;
    }
    if (!isExactDueDay(row.values.dueDate)) {
      continue;
    }

    const key = `task:${row.key}:${day}`;
    if (notified.has(key)) {
      continue;
    }

    const dueLabel = row.values.dueDate ?? "";
    const category = row.values.category?.trim() || "n/a";
    await showNotification(
      "Task due today",
      `${row.key} (${category}) is due today (${dueLabel}).`,
      true,
    );
    notified.add(key);
  }

    saveNotifiedKeys(notified);
  });
}

async function runDueCheck(): Promise<void> {
  try {
    await notifyDueItemsIfEnabled();
  } catch {
    // Background checks should never block the app.
  }
}

async function runWaterCheck(): Promise<void> {
  try {
    await notifyWaterIfEnabled();
  } catch {
    // Background checks should never block the app.
  }
}

/** Check assignments and exams for upcoming due dates. */
export function checkDueNotifications(): void {
  void runDueCheck();
}

/** Start hourly water reminders and due-date notifications. */
export function startNativeNotificationScheduler(): void {
  window.setTimeout(() => {
    void runDueCheck();
  }, 3000);

  window.setInterval(() => {
    void runWaterCheck();
  }, WATER_INTERVAL_MS);

  window.setInterval(() => {
    void runDueCheck();
  }, DUE_CHECK_INTERVAL_MS);
}
