import { loadSettings } from "../storage/settingsStore";
import {
  createReminder,
  deleteReminder,
  listReminders,
  updateReminder,
  type ReminderInfo,
} from "../storage/reminderStore";
import { buildDueAt } from "../utils/hubExecute";
import { listSheetFormRows } from "./secondBrain";

const NA = "n/a";
const CMDLET_PREFIX = "[Cmdlet]";

type ReminderSyncCounts = { created: number; updated: number; deleted: number };

interface DesiredReminder {
  title: string;
  listName: string;
  notes: string;
  dueAt: string;
  dueAtLocal: string;
  repeatRule?: "none" | "daily";
}

function emptyCounts(): ReminderSyncCounts {
  return { created: 0, updated: 0, deleted: 0 };
}

function addCounts(total: ReminderSyncCounts, next: ReminderSyncCounts): void {
  total.created += next.created;
  total.updated += next.updated;
  total.deleted += next.deleted;
}

function parseFormDate(value: string | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() ?? "");
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

function field(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.toLowerCase() !== NA ? trimmed : "";
}

function isStatus(value: string | undefined, statuses: string[]): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  return statuses.includes(normalized);
}

function titleFor(kind: "assignment" | "exam" | "project", label: string): string {
  const noun = kind === "assignment" ? "Assignment" : kind === "exam" ? "Exam" : "Project";
  return `${CMDLET_PREFIX} ${noun} due: ${label}`;
}

function dueAtLocalLabel(dueDate: string, hour: number, minute = 0): string {
  return `${dueDate}T${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
}

function parseTimeParts(value: string | undefined): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(field(value));
  if (!match) {
    // Prefer noon for date-only values to avoid timezone day-rollover.
    return { hour: 12, minute: 0 };
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function sameReminder(current: ReminderInfo | undefined, desired: DesiredReminder): boolean {
  return Boolean(
    current &&
      current.title === desired.title &&
      current.notes === desired.notes &&
      current.dueAtLocal === desired.dueAtLocal,
  );
}

async function listExistingReminders(
  listName: string,
  titlePrefix: string,
): Promise<ReminderInfo[]> {
  try {
    return await listReminders({ listName, titlePrefix });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("reminder list not found")) {
      return [];
    }
    throw error;
  }
}

async function reconcileOwnedReminders(
  listName: string,
  titlePrefix: string,
  desiredItems: DesiredReminder[],
): Promise<ReminderSyncCounts> {
  const counts = emptyCounts();
  const existing = await listExistingReminders(listName, titlePrefix);
  const existingByTitle = new Map(existing.map((reminder) => [reminder.title, reminder]));
  const desiredByTitle = new Map(desiredItems.map((item) => [item.title, item]));

  for (const reminder of existing) {
    if (desiredByTitle.has(reminder.title)) {
      continue;
    }
    try {
      await deleteReminder({ title: reminder.title, listName });
      counts.deleted += 1;
    } catch {
      // Stale reminder may already be gone.
    }
  }

  for (const item of desiredItems) {
    const current = existingByTitle.get(item.title);
    if (sameReminder(current, item)) {
      continue;
    }

    if (current) {
      await updateReminder({
        title: current.title,
        newTitle: item.title,
        notes: item.notes,
        dueAt: item.dueAt,
        listName,
        repeatRule: item.repeatRule,
      });
      counts.updated += 1;
      continue;
    }

    // Debug logging: record the values we will send to the native reminder store.
    // This helps diagnose timezone/serialization issues where dates shift by one day.
    try {
      // eslint-disable-next-line no-console
      console.debug("Creating reminder", {
        title: item.title,
        listName,
        notes: item.notes,
        dueAt: item.dueAt,
        dueAtLocal: item.dueAtLocal,
        systemTZ: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } catch {
      // ignore logging failures
    }

    await createReminder({
      title: item.title,
      listName,
      notes: item.notes,
      dueAt: item.dueAt,
      repeatRule: item.repeatRule,
    });
    counts.created += 1;
  }

  return counts;
}

async function upsertUnownedReminder(item: DesiredReminder): Promise<ReminderSyncCounts> {
  const counts = emptyCounts();
  const existing = await listExistingReminders(item.listName, "");
  const current = existing.find((reminder) => reminder.title === item.title);

  if (sameReminder(current, item)) {
    return counts;
  }

  if (current) {
    await updateReminder({
      title: current.title,
      newTitle: item.title,
      notes: item.notes,
      dueAt: item.dueAt,
      listName: item.listName,
      repeatRule: item.repeatRule,
    });
    counts.updated += 1;
    return counts;
  }

  await createReminder({
    title: item.title,
    listName: item.listName,
    notes: item.notes,
    dueAt: item.dueAt,
    repeatRule: item.repeatRule,
  });
  counts.created += 1;
  return counts;
}

function assignmentNotes(values: Record<string, string>): string {
  const parts = [
    `Course: ${field(values.course) || NA}`,
    `Progress: ${field(values.status) || "Not Started"}`,
  ];
  const priority = field(values.priority);
  if (priority) {
    parts.push(`Priority: ${priority}`);
  }
  return parts.join("\n");
}

function examNotes(values: Record<string, string>): string {
  return [
    `Course: ${field(values.course) || NA}`,
    `Study status: ${field(values.studyStatus) || "Not Started"}`,
    `Weight: ${field(values.weight) || NA}`,
  ].join("\n");
}

function projectNotes(values: Record<string, string>): string {
  return [
    `Category: ${field(values.category) || NA}`,
    `Status: ${field(values.status) || "Planning"}`,
    `Milestone: ${field(values.milestone) || NA}`,
  ].join("\n");
}

function taskNotes(values: Record<string, string>): string {
  const notes = field(values.notes);
  const status = field(values.status);
  return [status && `Status: ${status}`, notes].filter(Boolean).join("\n");
}

function buildDatedReminder(
  title: string,
  listName: string,
  dueDate: string | undefined,
  dueTime: string | undefined,
  notes: string,
): DesiredReminder | null {
  const normalizedDate = field(dueDate);
  if (!normalizedDate || !parseFormDate(normalizedDate)) {
    return null;
  }
  // If no explicit time was provided, send a date-only value so the native
  // layer can treat this as a date-only reminder (all-day). When a time is
  // provided, build a full ISO timestamp.
  const hasTime = Boolean(field(dueTime));
  let dueAt: string | null = null;
  let dueAtLocalLabelValue: string;
  if (!hasTime) {
    // send YYYY-MM-DD for date-only reminders
    dueAt = normalizedDate;
    // store local label as YYYY-MM-DDT12:00 for comparison/display
    dueAtLocalLabelValue = dueAtLocalLabel(normalizedDate, 12, 0);
  } else {
    dueAt = buildDueAt(normalizedDate, field(dueTime) || undefined) ?? null;
    if (!dueAt) {
      return null;
    }
    const { hour, minute } = parseTimeParts(dueTime);
    dueAtLocalLabelValue = dueAtLocalLabel(normalizedDate, hour, minute);
  }

  return {
    title,
    listName,
    notes,
    dueAt: dueAt!,
    dueAtLocal: dueAtLocalLabelValue,
  };
}

function buildHourReminder(
  title: string,
  listName: string,
  dueDate: string | undefined,
  hour: number,
  notes: string,
): DesiredReminder | null {
  const normalizedDate = field(dueDate);
  if (!normalizedDate || !parseFormDate(normalizedDate)) {
    return null;
  }
  const dueAt = buildDueAt(normalizedDate, `${hour.toString().padStart(2, "0")}:00`);
  if (!dueAt) {
    return null;
  }
  return {
    title,
    listName,
    notes,
    dueAt,
    dueAtLocal: dueAtLocalLabel(normalizedDate, hour),
  };
}

async function syncAssignmentReminders(
  listName: string,
  dueReminderHour: number,
): Promise<ReminderSyncCounts> {
  const desired: DesiredReminder[] = [];
  const assignments = await listSheetFormRows("assignments");

  for (const row of assignments) {
    if (isStatus(row.values.status, ["done", "finished"])) {
      continue;
    }
    const item = buildHourReminder(
      titleFor("assignment", row.key),
      listName,
      row.values.dueDate,
      dueReminderHour,
      assignmentNotes(row.values),
    );
    if (item) {
      desired.push(item);
    }
  }

  return reconcileOwnedReminders(listName, `${CMDLET_PREFIX} Assignment due: `, desired);
}

async function syncExamReminders(
  listName: string,
  dueReminderHour: number,
): Promise<ReminderSyncCounts> {
  const desired: DesiredReminder[] = [];
  const exams = await listSheetFormRows("exams");

  for (const row of exams) {
    if (isStatus(row.values.studyStatus, ["completed"])) {
      continue;
    }
    const item = buildHourReminder(
      titleFor("exam", row.key),
      listName,
      row.values.examDate,
      dueReminderHour,
      examNotes(row.values),
    );
    if (item) {
      desired.push(item);
    }
  }

  return reconcileOwnedReminders(listName, `${CMDLET_PREFIX} Exam due: `, desired);
}

async function syncProjectReminders(
  listName: string,
  dueReminderHour: number,
): Promise<ReminderSyncCounts> {
  const desired: DesiredReminder[] = [];
  const projects = await listSheetFormRows("projects");

  for (const row of projects) {
    if (isStatus(row.values.status, ["released", "archived"])) {
      continue;
    }
    const item = buildHourReminder(
      titleFor("project", row.key),
      listName,
      row.values.deadline,
      dueReminderHour,
      projectNotes(row.values),
    );
    if (item) {
      desired.push(item);
    }
  }

  return reconcileOwnedReminders(listName, `${CMDLET_PREFIX} Project due: `, desired);
}

export async function syncTaskReminder(
  values: Record<string, string>,
  previous?: Record<string, string>,
): Promise<ReminderSyncCounts> {
  const counts = emptyCounts();

  if (previous) {
    const oldTitle = field(previous.title);
    const oldList = field(previous.category);
    const newTitle = field(values.title);
    const newList = field(values.category);
    if (oldTitle && oldList && (oldTitle !== newTitle || oldList !== newList)) {
      try {
        await deleteReminder({ title: oldTitle, listName: oldList });
        counts.deleted += 1;
      } catch {
        // Old task reminder may already be gone.
      }
    }
  }

  const title = field(values.title);
  const listName = field(values.category);
  if (!title || !listName) {
    return counts;
  }

  if (isStatus(values.status, ["done", "finished"])) {
    try {
      await deleteReminder({ title, listName });
      counts.deleted += 1;
    } catch {
      // Completed task reminder may already be gone.
    }
    return counts;
  }

  const item = buildDatedReminder(
    title,
    listName,
    values.dueDate,
    field(values.dueTime) || undefined,
    taskNotes(values),
  );
  if (!item) {
    return counts;
  }

  addCounts(counts, await upsertUnownedReminder(item));
  return counts;
}

async function syncTaskReminders(): Promise<ReminderSyncCounts> {
  const counts = emptyCounts();
  const tasks = await listSheetFormRows("tasks");
  for (const row of tasks) {
    addCounts(counts, await syncTaskReminder(row.values));
  }
  return counts;
}

export async function syncDueRemindersQuiet(): Promise<void> {
  try {
    await syncDueReminders();
  } catch {
    // Background sync should never block commands.
  }
}

export async function syncDueReminders(): Promise<string> {
  const settings = await loadSettings();

  if (!settings.remindersEnabled) {
    return "Reminders disabled. Run: settings remindersEnabled true";
  }

  const listName = settings.cmdletReminderList || "Cmdlet";
  const counts = emptyCounts();

  if (settings.dueRemindersEnabled) {
    addCounts(counts, await syncAssignmentReminders(listName, settings.dueReminderHour));
    addCounts(counts, await syncExamReminders(listName, settings.dueReminderHour));
    addCounts(counts, await syncProjectReminders(listName, settings.dueReminderHour));
    addCounts(counts, await syncTaskReminders());
  }

  if (counts.created === 0 && counts.updated === 0 && counts.deleted === 0) {
    return "No reminder changes to sync right now.";
  }

  const details = [
    counts.created > 0 ? `${counts.created} created` : "",
    counts.updated > 0 ? `${counts.updated} updated` : "",
    counts.deleted > 0 ? `${counts.deleted} removed` : "",
  ].filter(Boolean);
  return `Synced Apple Reminders (${details.join(", ")}).`;
}
