import { invoke } from "@tauri-apps/api/core";

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
  return invoke<ReminderListInfo[]>("get_reminder_lists");
}

export async function createReminder(
  payload: CreateReminderPayload,
): Promise<CreateReminderResponse> {
  return invoke<CreateReminderResponse>("create_reminder", { payload });
}

export async function getReminderHistory(): Promise<ReminderHistoryEntry[]> {
  return invoke<ReminderHistoryEntry[]>("get_reminder_history");
}

export interface ListRemindersPayload {
  listName: string;
  titlePrefix?: string;
}

export async function listReminders(
  payload: ListRemindersPayload,
): Promise<ReminderInfo[]> {
  return invoke<ReminderInfo[]>("list_reminders", { payload });
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
  return invoke<DeleteReminderResponse>("delete_reminder", { payload });
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
  return invoke<UpdateReminderResponse>("update_reminder", { payload });
}
