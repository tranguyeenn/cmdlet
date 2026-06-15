import { timedInvoke } from "../lib/timedInvoke";

export type ReminderPriority = "none" | "low" | "medium" | "high";
export type RepeatRule = "none" | "daily" | "weekly" | "monthly";

export interface ReminderListInfo {
  name: string;
}

export interface CreateReminderPayload {
  title: string;
  notes?: string;
  dueAt?: string;
  listName?: string;
  priority?: ReminderPriority;
  repeatRule?: RepeatRule;
}

export interface CreateReminderResponse {
  id: string;
  message: string;
}

export interface ReminderHistoryEntry {
  id: string;
  title: string;
  notes?: string;
  dueAt?: string;
  listName: string;
  priority: string;
  repeatRule: string;
  createdAt: string;
}

export interface ReminderInfo {
  title: string;
  notes: string;
  dueAtLocal?: string;
}

export const DEFAULT_REMINDER_LIST = "Reminders";

export async function getReminderLists(): Promise<ReminderListInfo[]> {
  return timedInvoke<ReminderListInfo[]>("get_reminder_lists", undefined, "reminders.lists");
}

export async function createReminder(
  payload: CreateReminderPayload,
): Promise<CreateReminderResponse> {
  return timedInvoke<CreateReminderResponse>("create_reminder", { payload }, "reminders.create");
}

export async function getReminderHistory(): Promise<ReminderHistoryEntry[]> {
  return timedInvoke<ReminderHistoryEntry[]>("get_reminder_history", undefined, "storage.read.reminderHistory");
}

export interface ListRemindersPayload {
  listName: string;
  titlePrefix?: string;
}

export async function listReminders(
  payload: ListRemindersPayload,
): Promise<ReminderInfo[]> {
  return timedInvoke<ReminderInfo[]>("list_reminders", { payload }, "reminders.list");
}

export interface DeleteReminderPayload {
  title: string;
  listName?: string;
}

export interface DeleteReminderResponse {
  message: string;
}

export async function deleteReminder(
  payload: DeleteReminderPayload,
): Promise<DeleteReminderResponse> {
  return timedInvoke<DeleteReminderResponse>("delete_reminder", { payload }, "reminders.delete");
}

export interface UpdateReminderPayload {
  title: string;
  newTitle: string;
  notes?: string;
  dueAt?: string;
  listName?: string;
  repeatRule?: RepeatRule;
}

export interface UpdateReminderResponse {
  message: string;
}

export async function updateReminder(
  payload: UpdateReminderPayload,
): Promise<UpdateReminderResponse> {
  return timedInvoke<UpdateReminderResponse>("update_reminder", { payload }, "reminders.update");
}
