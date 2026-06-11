import { invoke } from "@tauri-apps/api/core";

export interface AppSettings {
  browser: string;
  calendarEnabled: boolean;
  remindersEnabled: boolean;
  notesEnabled: boolean;
  dueRemindersEnabled: boolean;
  dueReminderDaysBefore: number;
  dueReminderHour: number;
  cmdletReminderList: string;
  waterReminderEnabled: boolean;
}

export async function loadSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("load_settings");
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  return invoke<AppSettings>("save_settings", { settings });
}

export async function updateSetting(key: string, value: string): Promise<AppSettings> {
  return invoke<AppSettings>("update_setting", { key, value });
}
